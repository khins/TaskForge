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
