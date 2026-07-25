using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskForge.Api.Data;
using TaskForge.Api.Models;

namespace TaskForge.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProjectsController : ControllerBase
{
    private readonly ApplicationDbContext _context;

    public ProjectsController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetProjects()
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var projects = await _context.Projects
            .AsNoTracking()
            .Where(p => p.OwnerId == currentUserId.Value || p.Members.Any(m => m.UserId == currentUserId.Value))
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => new ProjectSummaryResponse(
                p.Id,
                p.Name,
                p.Description,
                p.OwnerId,
                p.Members.Count,
                p.Boards.Count,
                p.Tasks.Count,
                p.CreatedAt,
                p.UpdatedAt))
            .ToListAsync();

        return Ok(projects);
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> GetProject(long id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var project = await _context.Projects
            .AsNoTracking()
            .Where(p => p.Id == id)
            .Where(p => p.OwnerId == currentUserId.Value || p.Members.Any(m => m.UserId == currentUserId.Value))
            .Select(p => new ProjectDetailResponse(
                p.Id,
                p.Name,
                p.Description,
                p.OwnerId,
                p.Members
                    .OrderBy(m => m.JoinedAt)
                    .Select(m => new ProjectMemberResponse(
                        m.UserId,
                        m.User.Email,
                        m.User.FullName,
                        m.Role,
                        m.JoinedAt))
                    .ToList(),
                p.Boards
                    .OrderBy(b => b.CreatedAt)
                    .Select(b => new ProjectBoardResponse(
                        b.Id,
                        b.Name,
                        b.Description,
                        b.Columns.Count))
                    .ToList(),
                p.Tasks.Count,
                p.CreatedAt,
                p.UpdatedAt))
            .SingleOrDefaultAsync();

        if (project is null)
        {
            return NotFound(new { Message = "Project not found." });
        }

        return Ok(project);
    }

    [HttpPost]
    public async Task<IActionResult> CreateProject([FromBody] CreateProjectRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new { Message = "Project name is required." });
        }

        var userExists = await _context.Users.AnyAsync(u => u.Id == currentUserId.Value);
        if (!userExists)
        {
            return Unauthorized();
        }

        var now = DateTime.UtcNow;
        var project = new Project
        {
            Name = request.Name.Trim(),
            Description = request.Description,
            OwnerId = currentUserId.Value,
            CreatedAt = now,
            UpdatedAt = now,
            Members =
            {
                new ProjectMember
                {
                    UserId = currentUserId.Value,
                    Role = "owner",
                    JoinedAt = now
                }
            }
        };

        _context.Projects.Add(project);
        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetProject),
            new { id = project.Id },
            new ProjectSummaryResponse(
                project.Id,
                project.Name,
                project.Description,
                project.OwnerId,
                MemberCount: 1,
                BoardCount: 0,
                TaskCount: 0,
                project.CreatedAt,
                project.UpdatedAt));
    }

    [HttpPut("{id:long}")]
    public async Task<IActionResult> UpdateProject(long id, [FromBody] UpdateProjectRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new { Message = "Project name is required." });
        }

        var project = await _context.Projects.SingleOrDefaultAsync(p => p.Id == id);
        if (project is null)
        {
            return NotFound(new { Message = "Project not found." });
        }

        if (project.OwnerId != currentUserId.Value)
        {
            return Forbid();
        }

        project.Name = request.Name.Trim();
        project.Description = request.Description;
        project.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new ProjectSummaryResponse(
            project.Id,
            project.Name,
            project.Description,
            project.OwnerId,
            await _context.ProjectMembers.CountAsync(m => m.ProjectId == project.Id),
            await _context.Boards.CountAsync(b => b.ProjectId == project.Id),
            await _context.Tasks.CountAsync(t => t.ProjectId == project.Id),
            project.CreatedAt,
            project.UpdatedAt));
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> DeleteProject(long id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var project = await _context.Projects.SingleOrDefaultAsync(p => p.Id == id);
        if (project is null)
        {
            return NotFound(new { Message = "Project not found." });
        }

        if (project.OwnerId != currentUserId.Value)
        {
            return Forbid();
        }

        _context.Projects.Remove(project);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    private long? GetCurrentUserId()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return long.TryParse(userId, out var id) ? id : null;
    }
}

public class CreateProjectRequest
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
}

public class UpdateProjectRequest
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
}

public record ProjectSummaryResponse(
    long Id,
    string Name,
    string? Description,
    long? OwnerId,
    int MemberCount,
    int BoardCount,
    int TaskCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record ProjectDetailResponse(
    long Id,
    string Name,
    string? Description,
    long? OwnerId,
    IReadOnlyCollection<ProjectMemberResponse> Members,
    IReadOnlyCollection<ProjectBoardResponse> Boards,
    int TaskCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record ProjectMemberResponse(
    long UserId,
    string Email,
    string? FullName,
    string Role,
    DateTime JoinedAt);

public record ProjectBoardResponse(
    long Id,
    string Name,
    string? Description,
    int ColumnCount);
