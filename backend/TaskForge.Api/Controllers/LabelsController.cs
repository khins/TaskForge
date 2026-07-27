using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskForge.Api.Data;
using TaskForge.Api.Models;

namespace TaskForge.Api.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class LabelsController : ControllerBase
{
    private const string DefaultColor = "#6B7280";
    private readonly ApplicationDbContext _context;

    public LabelsController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet("projects/{projectId:long}/labels")]
    public async Task<IActionResult> GetProjectLabels(long projectId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        if (!await CanViewProject(projectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Project not found." });
        }

        var labels = await _context.Labels
            .AsNoTracking()
            .Where(l => l.ProjectId == projectId)
            .OrderBy(l => l.Name)
            .Select(l => new LabelResponse(
                l.Id,
                l.ProjectId,
                l.Name,
                l.Color,
                l.TaskLabels.Count,
                l.CreatedAt))
            .ToListAsync();

        return Ok(labels);
    }

    [HttpGet("labels/{id:long}")]
    public async Task<IActionResult> GetLabel(long id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var label = await _context.Labels
            .AsNoTracking()
            .Where(l => l.Id == id)
            .Select(l => new LabelResponse(
                l.Id,
                l.ProjectId,
                l.Name,
                l.Color,
                l.TaskLabels.Count,
                l.CreatedAt))
            .SingleOrDefaultAsync();

        if (label is null || !await CanViewProject(label.ProjectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Label not found." });
        }

        return Ok(label);
    }

    [HttpPost("projects/{projectId:long}/labels")]
    public async Task<IActionResult> CreateLabel(long projectId, [FromBody] CreateLabelRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var validationError = ValidateLabel(request.Name, request.Color);
        if (validationError is not null)
        {
            return BadRequest(new { Message = validationError });
        }

        if (!await CanManageProject(projectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Project not found or you cannot manage it." });
        }

        var name = request.Name.Trim();
        if (await _context.Labels.AnyAsync(l => l.ProjectId == projectId && l.Name == name))
        {
            return Conflict(new { Message = "A label with this name already exists in the project." });
        }

        var label = new Label
        {
            ProjectId = projectId,
            Name = name,
            Color = NormalizeColor(request.Color),
            CreatedAt = DateTime.UtcNow
        };

        _context.Labels.Add(label);
        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetLabel),
            new { id = label.Id },
            ToResponse(label, taskCount: 0));
    }

    [HttpPut("labels/{id:long}")]
    public async Task<IActionResult> UpdateLabel(long id, [FromBody] UpdateLabelRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var validationError = ValidateLabel(request.Name, request.Color);
        if (validationError is not null)
        {
            return BadRequest(new { Message = validationError });
        }

        var label = await _context.Labels.SingleOrDefaultAsync(l => l.Id == id);
        if (label is null || !await CanManageProject(label.ProjectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Label not found or you cannot manage it." });
        }

        var name = request.Name.Trim();
        if (await _context.Labels.AnyAsync(l =>
                l.ProjectId == label.ProjectId && l.Id != id && l.Name == name))
        {
            return Conflict(new { Message = "A label with this name already exists in the project." });
        }

        label.Name = name;
        label.Color = NormalizeColor(request.Color);
        await _context.SaveChangesAsync();

        var taskCount = await _context.TaskLabels.CountAsync(tl => tl.LabelId == id);
        return Ok(ToResponse(label, taskCount));
    }

    [HttpDelete("labels/{id:long}")]
    public async Task<IActionResult> DeleteLabel(long id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var label = await _context.Labels.SingleOrDefaultAsync(l => l.Id == id);
        if (label is null || !await CanManageProject(label.ProjectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Label not found or you cannot manage it." });
        }

        _context.Labels.Remove(label);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    [HttpPost("tasks/{taskId:long}/labels/{labelId:long}")]
    public async Task<IActionResult> AddLabelToTask(long taskId, long labelId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var taskProjectId = await GetTaskProjectId(taskId);
        if (taskProjectId is null || !await CanViewProject(taskProjectId.Value, currentUserId.Value))
        {
            return NotFound(new { Message = "Task not found." });
        }

        var label = await _context.Labels
            .AsNoTracking()
            .SingleOrDefaultAsync(l => l.Id == labelId && l.ProjectId == taskProjectId.Value);

        if (label is null)
        {
            return BadRequest(new { Message = "The label does not belong to the task's project." });
        }

        if (await _context.TaskLabels.AnyAsync(tl => tl.TaskId == taskId && tl.LabelId == labelId))
        {
            return Conflict(new { Message = "The label is already attached to this task." });
        }

        _context.TaskLabels.Add(new TaskLabel
        {
            TaskId = taskId,
            LabelId = labelId,
            CreatedAt = DateTime.UtcNow
        });
        await _context.SaveChangesAsync();

        return Ok(new TaskLabelAssignmentResponse(taskId, label.Id, label.Name, label.Color));
    }

    [HttpDelete("tasks/{taskId:long}/labels/{labelId:long}")]
    public async Task<IActionResult> RemoveLabelFromTask(long taskId, long labelId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var taskProjectId = await GetTaskProjectId(taskId);
        if (taskProjectId is null || !await CanViewProject(taskProjectId.Value, currentUserId.Value))
        {
            return NotFound(new { Message = "Task not found." });
        }

        var taskLabel = await _context.TaskLabels
            .SingleOrDefaultAsync(tl => tl.TaskId == taskId && tl.LabelId == labelId);

        if (taskLabel is null)
        {
            return NotFound(new { Message = "The label is not attached to this task." });
        }

        _context.TaskLabels.Remove(taskLabel);
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

    private async Task<bool> CanManageProject(long projectId, long userId)
    {
        if (User.IsInRole("admin")) return await _context.Projects.AnyAsync(p => p.Id == projectId);
        return await _context.Projects.AnyAsync(p =>
            p.Id == projectId &&
            (p.OwnerId == userId || p.Members.Any(m =>
                m.UserId == userId && (m.Role == "owner" || m.Role == "admin"))));
    }

    private long? GetCurrentUserId()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return long.TryParse(userId, out var id) ? id : null;
    }

    private static string? ValidateLabel(string? name, string? color)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return "Label name is required.";
        }

        if (name.Trim().Length > 100)
        {
            return "Label name cannot exceed 100 characters.";
        }

        if (!string.IsNullOrWhiteSpace(color) &&
            !Regex.IsMatch(color.Trim(), "^#[0-9A-Fa-f]{6}$"))
        {
            return "Label color must be a six-digit hex color such as #2563EB.";
        }

        return null;
    }

    private static string NormalizeColor(string? color)
    {
        return string.IsNullOrWhiteSpace(color) ? DefaultColor : color.Trim().ToUpperInvariant();
    }

    private static LabelResponse ToResponse(Label label, int taskCount)
    {
        return new LabelResponse(
            label.Id,
            label.ProjectId,
            label.Name,
            label.Color,
            taskCount,
            label.CreatedAt);
    }
}

public class CreateLabelRequest
{
    public string Name { get; set; } = null!;
    public string? Color { get; set; }
}

public class UpdateLabelRequest
{
    public string Name { get; set; } = null!;
    public string? Color { get; set; }
}

public record LabelResponse(
    long Id,
    long ProjectId,
    string Name,
    string Color,
    int TaskCount,
    DateTime CreatedAt);

public record TaskLabelAssignmentResponse(
    long TaskId,
    long LabelId,
    string Name,
    string Color);
