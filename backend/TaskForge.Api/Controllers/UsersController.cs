using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskForge.Api.Data;
using TaskForge.Api.Models;

namespace TaskForge.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly ApplicationDbContext _context;

    public UsersController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    [Authorize]
    public async Task<IActionResult> GetUsers()
    {
        var users = await _context.Users
            .AsNoTracking()
            .Select(u => new UserResponse(u.Id, u.Email, u.FullName, u.Role, u.IsActive, u.CreatedAt, u.UpdatedAt))
            .ToListAsync();

        return Ok(users);
    }

    [HttpGet("{id:long}")]
    [Authorize]
    public async Task<IActionResult> GetUser(long id)
    {
        var user = await _context.Users
            .AsNoTracking()
            .Where(u => u.Id == id)
            .Select(u => new UserResponse(u.Id, u.Email, u.FullName, u.Role, u.IsActive, u.CreatedAt, u.UpdatedAt))
            .SingleOrDefaultAsync();

        return user is null ? NotFound() : Ok(user);
    }

    [HttpGet("{id:long}/assets")]
    [Authorize]
    public async Task<IActionResult> GetUserAssets(long id)
    {
        if (!await _context.Users.AnyAsync(u => u.Id == id))
        {
            return NotFound();
        }

        var ownedProjects = await _context.Projects
            .AsNoTracking()
            .Where(p => p.OwnerId == id)
            .Select(p => new UserProjectAsset(p.Id, p.Name))
            .ToListAsync();
        var memberships = await _context.ProjectMembers
            .AsNoTracking()
            .Where(m => m.UserId == id)
            .Select(m => new UserProjectAsset(m.ProjectId, m.Project.Name))
            .ToListAsync();
        var assignedTasks = await GetTaskAssets(_context.Tasks.Where(t => t.AssigneeId == id));
        var reportedTasks = await GetTaskAssets(_context.Tasks.Where(t => t.ReporterId == id));
        var comments = await _context.TaskComments
            .AsNoTracking()
            .Where(c => c.AuthorId == id)
            .Select(c => new UserTaskAsset(
                c.TaskId,
                c.Task.ProjectId,
                c.Task.BoardColumn != null ? c.Task.BoardColumn.BoardId : null,
                c.Task.Project.Name,
                c.Task.Title,
                c.Body))
            .ToListAsync();
        var statusChanges = await _context.TaskStatusHistory
            .AsNoTracking()
            .Where(h => h.ChangedById == id)
            .Select(h => new UserTaskAsset(
                h.TaskId,
                h.Task.ProjectId,
                h.Task.BoardColumn != null ? h.Task.BoardColumn.BoardId : null,
                h.Task.Project.Name,
                h.Task.Title,
                $"Changed status to {h.ToStatus}"))
            .ToListAsync();
        var attachments = await _context.Attachments
            .AsNoTracking()
            .Where(a => a.UploadedById == id)
            .Select(a => new UserTaskAsset(
                a.TaskId,
                a.Task.ProjectId,
                a.Task.BoardColumn != null ? a.Task.BoardColumn.BoardId : null,
                a.Task.Project.Name,
                a.Task.Title,
                a.FileName))
            .ToListAsync();

        return Ok(new UserAssetsResponse(
            ownedProjects,
            memberships,
            assignedTasks,
            reportedTasks,
            comments,
            statusChanges,
            attachments));
    }

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            return BadRequest(new { Message = "Email is required." });
        }

        if (string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { Message = "Password is required." });
        }

        var email = request.Email.Trim();
        var exists = await _context.Users.AnyAsync(u => u.Email == email);
        if (exists)
        {
            return Conflict(new { Message = "Email already exists." });
        }

        var now = DateTime.UtcNow;
        var user = new User
        {
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            FullName = string.IsNullOrWhiteSpace(request.FullName) ? null : request.FullName.Trim(),
            Role = string.IsNullOrWhiteSpace(request.Role) ? "user" : request.Role.Trim(),
            IsActive = request.IsActive ?? true,
            CreatedAt = now,
            UpdatedAt = now
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var response = new UserResponse(user.Id, user.Email, user.FullName, user.Role, user.IsActive, user.CreatedAt, user.UpdatedAt);
        return CreatedAtAction(nameof(GetUser), new { id = user.Id }, response);
    }

    [HttpDelete("{id:long}")]
    [Authorize]
    public async Task<IActionResult> DeleteUser(long id)
    {
        var user = await _context.Users.SingleOrDefaultAsync(u => u.Id == id);
        if (user is null)
        {
            return NotFound();
        }

        var dependencies = new Dictionary<string, int>
        {
            ["owned projects"] = await _context.Projects.CountAsync(p => p.OwnerId == id),
            ["project memberships"] = await _context.ProjectMembers.CountAsync(m => m.UserId == id),
            ["assigned tasks"] = await _context.Tasks.CountAsync(t => t.AssigneeId == id),
            ["reported tasks"] = await _context.Tasks.CountAsync(t => t.ReporterId == id),
            ["comments"] = await _context.TaskComments.CountAsync(c => c.AuthorId == id),
            ["status changes"] = await _context.TaskStatusHistory.CountAsync(h => h.ChangedById == id),
            ["attachments"] = await _context.Attachments.CountAsync(a => a.UploadedById == id)
        };

        var blockingAssets = dependencies
            .Where(item => item.Value > 0)
            .ToDictionary(item => item.Key, item => item.Value);

        if (blockingAssets.Count > 0)
        {
            var summary = string.Join(", ", blockingAssets.Select(item => $"{item.Value} {item.Key}"));
            return Conflict(new
            {
                Message = $"User cannot be deleted while they still have TaskForge assets: {summary}. Remove or reassign these assets first.",
                Assets = blockingAssets
            });
        }

        _context.Users.Remove(user);
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            return Conflict(new
            {
                Message = "User cannot be deleted because TaskForge data still references this account. Remove or reassign those assets first."
            });
        }

        return NoContent();
    }

    private async Task<List<UserTaskAsset>> GetTaskAssets(IQueryable<TaskItem> tasks)
    {
        return await tasks
            .AsNoTracking()
            .Select(t => new UserTaskAsset(
                t.Id,
                t.ProjectId,
                t.BoardColumn != null ? t.BoardColumn.BoardId : null,
                t.Project.Name,
                t.Title,
                null))
            .ToListAsync();
    }
}

public class CreateUserRequest
{
    public string Email { get; set; } = null!;
    public string Password { get; set; } = null!;
    public string? FullName { get; set; }
    public string? Role { get; set; }
    public bool? IsActive { get; set; }
}

public record UserResponse(
    long Id,
    string Email,
    string? FullName,
    string Role,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record UserProjectAsset(long ProjectId, string ProjectName);

public record UserTaskAsset(
    long TaskId,
    long ProjectId,
    long? BoardId,
    string ProjectName,
    string TaskTitle,
    string? Detail);

public record UserAssetsResponse(
    IReadOnlyCollection<UserProjectAsset> OwnedProjects,
    IReadOnlyCollection<UserProjectAsset> Memberships,
    IReadOnlyCollection<UserTaskAsset> AssignedTasks,
    IReadOnlyCollection<UserTaskAsset> ReportedTasks,
    IReadOnlyCollection<UserTaskAsset> Comments,
    IReadOnlyCollection<UserTaskAsset> StatusChanges,
    IReadOnlyCollection<UserTaskAsset> Attachments);
