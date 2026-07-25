using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskForge.Api.Data;
using TaskForge.Api.Models;

namespace TaskForge.Api.Controllers;

[ApiController]
[Route("api/projects/{projectId:long}/members")]
[Authorize]
public class ProjectMembersController : ControllerBase
{
    private static readonly HashSet<string> AssignableRoles =
        new(StringComparer.OrdinalIgnoreCase) { "admin", "member", "viewer" };

    private readonly ApplicationDbContext _context;

    public ProjectMembersController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetProjectMembers(long projectId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var access = await GetProjectAccess(projectId, currentUserId.Value);
        if (access is null || !access.CanView)
        {
            return NotFound(new { Message = "Project not found." });
        }

        var members = await _context.ProjectMembers
            .AsNoTracking()
            .Where(m => m.ProjectId == projectId)
            .OrderBy(m => m.Role == "owner" ? 0 : m.Role == "admin" ? 1 : m.Role == "member" ? 2 : 3)
            .ThenBy(m => m.User.FullName ?? m.User.Email)
            .Select(m => new ProjectMemberResponse(
                m.UserId,
                m.User.Email,
                m.User.FullName,
                m.Role,
                m.JoinedAt))
            .ToListAsync();

        return Ok(members);
    }

    [HttpPost]
    public async Task<IActionResult> AddProjectMember(
        long projectId,
        [FromBody] AddProjectMemberRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Email))
        {
            return BadRequest(new { Message = "User email is required." });
        }

        var role = NormalizeRole(request.Role);
        if (role is null)
        {
            return BadRequest(new { Message = "Role must be admin, member, or viewer." });
        }

        var access = await GetProjectAccess(projectId, currentUserId.Value);
        if (access is null)
        {
            return NotFound(new { Message = "Project not found." });
        }

        if (!access.CanManage)
        {
            return Forbid();
        }

        if (role == "admin" && !access.IsOwner)
        {
            return Forbid();
        }

        var email = request.Email.Trim();
        var user = await _context.Users
            .SingleOrDefaultAsync(u => EF.Functions.ILike(u.Email, email));

        if (user is null || !user.IsActive)
        {
            return NotFound(new { Message = "An active user with that email was not found." });
        }

        if (await _context.ProjectMembers.AnyAsync(m =>
                m.ProjectId == projectId && m.UserId == user.Id))
        {
            return Conflict(new { Message = "The user is already a member of this project." });
        }

        var membership = new ProjectMember
        {
            ProjectId = projectId,
            UserId = user.Id,
            Role = role,
            JoinedAt = DateTime.UtcNow
        };

        _context.ProjectMembers.Add(membership);
        await _context.SaveChangesAsync();

        var response = ToResponse(membership, user);
        return Created($"/api/projects/{projectId}/members", response);
    }

    [HttpPut("{userId:long}")]
    public async Task<IActionResult> UpdateProjectMember(
        long projectId,
        long userId,
        [FromBody] UpdateProjectMemberRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var role = NormalizeRole(request.Role);
        if (role is null)
        {
            return BadRequest(new { Message = "Role must be admin, member, or viewer." });
        }

        var access = await GetProjectAccess(projectId, currentUserId.Value);
        if (access is null)
        {
            return NotFound(new { Message = "Project not found." });
        }

        if (!access.CanManage)
        {
            return Forbid();
        }

        var membership = await _context.ProjectMembers
            .Include(m => m.User)
            .SingleOrDefaultAsync(m => m.ProjectId == projectId && m.UserId == userId);

        if (membership is null)
        {
            return NotFound(new { Message = "Project member not found." });
        }

        if (membership.Role == "owner")
        {
            return BadRequest(new { Message = "The project owner's role cannot be changed here." });
        }

        if (!access.IsOwner && (membership.Role == "admin" || role == "admin"))
        {
            return Forbid();
        }

        membership.Role = role;
        await _context.SaveChangesAsync();

        return Ok(ToResponse(membership, membership.User));
    }

    [HttpDelete("{userId:long}")]
    public async Task<IActionResult> RemoveProjectMember(long projectId, long userId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var access = await GetProjectAccess(projectId, currentUserId.Value);
        if (access is null)
        {
            return NotFound(new { Message = "Project not found." });
        }

        if (!access.CanManage)
        {
            return Forbid();
        }

        var membership = await _context.ProjectMembers
            .SingleOrDefaultAsync(m => m.ProjectId == projectId && m.UserId == userId);

        if (membership is null)
        {
            return NotFound(new { Message = "Project member not found." });
        }

        if (membership.Role == "owner")
        {
            return BadRequest(new { Message = "The project owner cannot be removed." });
        }

        if (!access.IsOwner && membership.Role == "admin")
        {
            return Forbid();
        }

        _context.ProjectMembers.Remove(membership);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    private async Task<ProjectAccess?> GetProjectAccess(long projectId, long userId)
    {
        return await _context.Projects
            .AsNoTracking()
            .Where(p => p.Id == projectId)
            .Select(p => new ProjectAccess(
                p.OwnerId == userId,
                p.Members
                    .Where(m => m.UserId == userId)
                    .Select(m => m.Role)
                    .FirstOrDefault()))
            .SingleOrDefaultAsync();
    }

    private long? GetCurrentUserId()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return long.TryParse(userId, out var id) ? id : null;
    }

    private static string? NormalizeRole(string? role)
    {
        if (string.IsNullOrWhiteSpace(role))
        {
            return "member";
        }

        var normalizedRole = role.Trim().ToLowerInvariant();
        return AssignableRoles.Contains(normalizedRole) ? normalizedRole : null;
    }

    private static ProjectMemberResponse ToResponse(ProjectMember membership, User user)
    {
        return new ProjectMemberResponse(
            user.Id,
            user.Email,
            user.FullName,
            membership.Role,
            membership.JoinedAt);
    }

    private sealed record ProjectAccess(bool IsOwner, string? Role)
    {
        public bool CanView => IsOwner || Role is not null;
        public bool CanManage => IsOwner || Role == "admin";
    }
}

public class AddProjectMemberRequest
{
    public string Email { get; set; } = null!;
    public string? Role { get; set; }
}

public class UpdateProjectMemberRequest
{
    public string Role { get; set; } = null!;
}
