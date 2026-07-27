using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskForge.Api.Data;
using TaskForge.Api.Models;

namespace TaskForge.Api.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class TaskCommentsController : ControllerBase
{
    private readonly ApplicationDbContext _context;

    public TaskCommentsController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet("tasks/{taskId:long}/comments")]
    public async Task<IActionResult> GetTaskComments(long taskId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var projectId = await GetTaskProjectId(taskId);
        if (projectId is null || !await CanViewProject(projectId.Value, currentUserId.Value))
        {
            return NotFound(new { Message = "Task not found." });
        }

        var comments = await _context.TaskComments
            .AsNoTracking()
            .Where(c => c.TaskId == taskId)
            .OrderBy(c => c.CreatedAt)
            .Select(c => new TaskCommentResponse(
                c.Id,
                c.TaskId,
                c.AuthorId,
                c.Author.FullName ?? c.Author.Email,
                c.Body,
                c.CreatedAt,
                c.UpdatedAt))
            .ToListAsync();

        return Ok(comments);
    }

    [HttpPost("tasks/{taskId:long}/comments")]
    public async Task<IActionResult> CreateTaskComment(long taskId, [FromBody] CreateTaskCommentRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Body))
        {
            return BadRequest(new { Message = "Comment body is required." });
        }

        var projectId = await GetTaskProjectId(taskId);
        if (projectId is null || !await CanViewProject(projectId.Value, currentUserId.Value))
        {
            return NotFound(new { Message = "Task not found." });
        }

        var now = DateTime.UtcNow;
        var comment = new TaskComment
        {
            TaskId = taskId,
            AuthorId = currentUserId.Value,
            Body = request.Body.Trim(),
            CreatedAt = now,
            UpdatedAt = now
        };

        _context.TaskComments.Add(comment);
        await _context.SaveChangesAsync();

        var authorName = await _context.Users
            .Where(u => u.Id == currentUserId.Value)
            .Select(u => u.FullName ?? u.Email)
            .SingleAsync();

        return CreatedAtAction(
            nameof(GetTaskComments),
            new { taskId },
            ToResponse(comment, authorName));
    }

    [HttpPut("comments/{id:long}")]
    public async Task<IActionResult> UpdateTaskComment(long id, [FromBody] UpdateTaskCommentRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Body))
        {
            return BadRequest(new { Message = "Comment body is required." });
        }

        var comment = await _context.TaskComments
            .Include(c => c.Task)
            .Include(c => c.Author)
            .SingleOrDefaultAsync(c => c.Id == id);

        if (comment is null || !await CanViewProject(comment.Task.ProjectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Comment not found." });
        }

        if (!await CanManageComment(comment, currentUserId.Value))
        {
            return Forbid();
        }

        comment.Body = request.Body.Trim();
        comment.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(ToResponse(comment, comment.Author.FullName ?? comment.Author.Email));
    }

    [HttpDelete("comments/{id:long}")]
    public async Task<IActionResult> DeleteTaskComment(long id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var comment = await _context.TaskComments
            .Include(c => c.Task)
            .SingleOrDefaultAsync(c => c.Id == id);

        if (comment is null || !await CanViewProject(comment.Task.ProjectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Comment not found." });
        }

        if (!await CanManageComment(comment, currentUserId.Value))
        {
            return Forbid();
        }

        _context.TaskComments.Remove(comment);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    private async Task<long?> GetTaskProjectId(long taskId)
    {
        return await _context.Tasks
            .AsNoTracking()
            .Where(t => t.Id == taskId)
            .Select(t => (long?)t.ProjectId)
            .SingleOrDefaultAsync();
    }

    private async Task<bool> CanViewProject(long projectId, long userId)
    {
        if (User.IsInRole("admin")) return await _context.Projects.AnyAsync(p => p.Id == projectId);
        return await _context.Projects.AnyAsync(p =>
            p.Id == projectId &&
            (p.OwnerId == userId || p.Members.Any(m => m.UserId == userId)));
    }

    private async Task<bool> CanManageComment(TaskComment comment, long userId)
    {
        if (User.IsInRole("admin")) return true;
        if (comment.AuthorId == userId)
        {
            return true;
        }

        return await _context.Projects.AnyAsync(p =>
            p.Id == comment.Task.ProjectId &&
            (p.OwnerId == userId || p.Members.Any(m =>
                m.UserId == userId && (m.Role == "owner" || m.Role == "admin"))));
    }

    private long? GetCurrentUserId()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return long.TryParse(userId, out var id) ? id : null;
    }

    private static TaskCommentResponse ToResponse(TaskComment comment, string authorName)
    {
        return new TaskCommentResponse(
            comment.Id,
            comment.TaskId,
            comment.AuthorId,
            authorName,
            comment.Body,
            comment.CreatedAt,
            comment.UpdatedAt);
    }
}

public class CreateTaskCommentRequest
{
    public string Body { get; set; } = null!;
}

public class UpdateTaskCommentRequest
{
    public string Body { get; set; } = null!;
}

public record TaskCommentResponse(
    long Id,
    long TaskId,
    long AuthorId,
    string AuthorName,
    string Body,
    DateTime CreatedAt,
    DateTime UpdatedAt);
