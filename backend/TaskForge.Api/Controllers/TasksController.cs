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
public class TasksController : ControllerBase
{
    private readonly ApplicationDbContext _context;

    public TasksController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet("projects/{projectId:long}/tasks")]
    public async Task<IActionResult> GetProjectTasks(long projectId)
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

        var tasks = await _context.Tasks
            .AsNoTracking()
            .Where(t => t.ProjectId == projectId)
            .OrderBy(t => t.BoardColumnId == null)
            .ThenBy(t => t.BoardColumnId)
            .ThenBy(t => t.Position)
            .ThenBy(t => t.CreatedAt)
            .Select(t => ToSummaryResponse(t))
            .ToListAsync();

        return Ok(tasks);
    }

    [HttpGet("boards/{boardId:long}/tasks")]
    public async Task<IActionResult> GetBoardTasks(long boardId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var boardProjectId = await _context.Boards
            .AsNoTracking()
            .Where(b => b.Id == boardId)
            .Select(b => (long?)b.ProjectId)
            .SingleOrDefaultAsync();

        if (boardProjectId is null || !await CanViewProject(boardProjectId.Value, currentUserId.Value))
        {
            return NotFound(new { Message = "Board not found." });
        }

        var tasks = await _context.Tasks
            .AsNoTracking()
            .Where(t => t.BoardColumn != null && t.BoardColumn.BoardId == boardId)
            .OrderBy(t => t.BoardColumnId)
            .ThenBy(t => t.Position)
            .ThenBy(t => t.CreatedAt)
            .Select(t => ToSummaryResponse(t))
            .ToListAsync();

        return Ok(tasks);
    }

    [HttpGet("tasks/{id:long}")]
    public async Task<IActionResult> GetTask(long id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var taskProjectId = await _context.Tasks
            .AsNoTracking()
            .Where(t => t.Id == id)
            .Select(t => (long?)t.ProjectId)
            .SingleOrDefaultAsync();

        if (taskProjectId is null || !await CanViewProject(taskProjectId.Value, currentUserId.Value))
        {
            return NotFound(new { Message = "Task not found." });
        }

        var task = await _context.Tasks
            .AsNoTracking()
            .Where(t => t.Id == id)
            .Select(t => new TaskDetailResponse(
                t.Id,
                t.ProjectId,
                t.BoardColumnId,
                t.AssigneeId,
                t.ReporterId,
                t.Title,
                t.Description,
                t.Status,
                t.Priority,
                t.Position,
                t.DueDate,
                t.Comments.Count,
                t.TaskLabels.Select(tl => new TaskLabelResponse(
                    tl.LabelId,
                    tl.Label.Name,
                    tl.Label.Color)).ToList(),
                t.StatusHistory
                    .OrderByDescending(h => h.ChangedAt)
                    .Select(h => new TaskStatusHistoryResponse(
                        h.Id,
                        h.FromStatus,
                        h.ToStatus,
                        h.ChangedById,
                        h.ChangedAt))
                    .ToList(),
                t.CreatedAt,
                t.UpdatedAt))
            .SingleAsync();

        return Ok(task);
    }

    [HttpPost("projects/{projectId:long}/tasks")]
    public async Task<IActionResult> CreateTask(long projectId, [FromBody] CreateTaskRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest(new { Message = "Task title is required." });
        }

        if (!await CanViewProject(projectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Project not found." });
        }

        if (!await ValidateTaskReferences(projectId, request.BoardColumnId, request.AssigneeId))
        {
            return BadRequest(new { Message = "Board column or assignee is not valid for this project." });
        }

        var status = string.IsNullOrWhiteSpace(request.Status) ? "Todo" : request.Status.Trim();
        var now = DateTime.UtcNow;
        var position = request.Position ?? await GetNextPosition(request.BoardColumnId);

        var task = new TaskItem
        {
            ProjectId = projectId,
            BoardColumnId = request.BoardColumnId,
            AssigneeId = request.AssigneeId,
            ReporterId = currentUserId.Value,
            Title = request.Title.Trim(),
            Description = request.Description,
            Status = status,
            Priority = string.IsNullOrWhiteSpace(request.Priority) ? "Medium" : request.Priority.Trim(),
            Position = position,
            DueDate = request.DueDate,
            CreatedAt = now,
            UpdatedAt = now,
            StatusHistory =
            {
                new TaskStatusHistory
                {
                    FromStatus = null,
                    ToStatus = status,
                    ChangedById = currentUserId.Value,
                    ChangedAt = now
                }
            }
        };

        _context.Tasks.Add(task);
        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetTask),
            new { id = task.Id },
            ToSummaryResponse(task));
    }

    [HttpPut("tasks/{id:long}")]
    public async Task<IActionResult> UpdateTask(long id, [FromBody] UpdateTaskRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest(new { Message = "Task title is required." });
        }

        var task = await _context.Tasks.SingleOrDefaultAsync(t => t.Id == id);
        if (task is null || !await CanViewProject(task.ProjectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Task not found." });
        }

        if (!await ValidateTaskReferences(task.ProjectId, request.BoardColumnId, request.AssigneeId))
        {
            return BadRequest(new { Message = "Board column or assignee is not valid for this project." });
        }

        var oldStatus = task.Status;
        var newStatus = string.IsNullOrWhiteSpace(request.Status) ? task.Status : request.Status.Trim();
        var now = DateTime.UtcNow;

        task.Title = request.Title.Trim();
        task.Description = request.Description;
        task.Status = newStatus;
        task.Priority = string.IsNullOrWhiteSpace(request.Priority) ? task.Priority : request.Priority.Trim();
        task.BoardColumnId = request.BoardColumnId;
        task.AssigneeId = request.AssigneeId;
        task.Position = request.Position ?? task.Position;
        task.DueDate = request.DueDate;
        task.UpdatedAt = now;

        if (!string.Equals(oldStatus, newStatus, StringComparison.Ordinal))
        {
            _context.TaskStatusHistory.Add(new TaskStatusHistory
            {
                Task = task,
                FromStatus = oldStatus,
                ToStatus = newStatus,
                ChangedById = currentUserId.Value,
                ChangedAt = now
            });
        }

        await _context.SaveChangesAsync();

        return Ok(ToSummaryResponse(task));
    }

    [HttpPatch("tasks/{id:long}/move")]
    public async Task<IActionResult> MoveTask(long id, [FromBody] MoveTaskRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        if (request.BoardColumnId is null)
        {
            return BadRequest(new { Message = "Board column is required when moving a task." });
        }

        var task = await _context.Tasks.SingleOrDefaultAsync(t => t.Id == id);
        if (task is null || !await CanViewProject(task.ProjectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Task not found." });
        }

        if (!await ValidateTaskReferences(task.ProjectId, request.BoardColumnId, assigneeId: null))
        {
            return BadRequest(new { Message = "Board column is not valid for this project." });
        }

        var oldStatus = task.Status;
        var newStatus = string.IsNullOrWhiteSpace(request.Status) ? task.Status : request.Status.Trim();
        var now = DateTime.UtcNow;

        task.BoardColumnId = request.BoardColumnId;
        task.Position = request.Position;
        task.Status = newStatus;
        task.UpdatedAt = now;

        if (!string.Equals(oldStatus, newStatus, StringComparison.Ordinal))
        {
            _context.TaskStatusHistory.Add(new TaskStatusHistory
            {
                Task = task,
                FromStatus = oldStatus,
                ToStatus = newStatus,
                ChangedById = currentUserId.Value,
                ChangedAt = now
            });
        }

        await _context.SaveChangesAsync();

        return Ok(ToSummaryResponse(task));
    }

    [HttpDelete("tasks/{id:long}")]
    public async Task<IActionResult> DeleteTask(long id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var task = await _context.Tasks.SingleOrDefaultAsync(t => t.Id == id);
        if (task is null || !await CanViewProject(task.ProjectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Task not found." });
        }

        _context.Tasks.Remove(task);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    private async Task<bool> CanViewProject(long projectId, long userId)
    {
        if (User.IsInRole("admin")) return await _context.Projects.AnyAsync(p => p.Id == projectId);
        return await _context.Projects.AnyAsync(p =>
            p.Id == projectId &&
            (p.OwnerId == userId || p.Members.Any(m => m.UserId == userId)));
    }

    private async Task<bool> ValidateTaskReferences(long projectId, long? boardColumnId, long? assigneeId)
    {
        if (boardColumnId.HasValue)
        {
            var columnMatchesProject = await _context.BoardColumns.AnyAsync(c =>
                c.Id == boardColumnId.Value &&
                c.Board.ProjectId == projectId);

            if (!columnMatchesProject)
            {
                return false;
            }
        }

        if (assigneeId.HasValue)
        {
            var assigneeMatchesProject = await _context.Projects.AnyAsync(p =>
                p.Id == projectId &&
                (p.OwnerId == assigneeId.Value ||
                 p.Members.Any(m => m.UserId == assigneeId.Value)));

            var currentUserId = GetCurrentUserId();
            var globalAdminAssigningSelf =
                User.IsInRole("admin") &&
                currentUserId.HasValue &&
                currentUserId.Value == assigneeId.Value;

            if (!assigneeMatchesProject && !globalAdminAssigningSelf)
            {
                return false;
            }
        }

        return true;
    }

    private async Task<int> GetNextPosition(long? boardColumnId)
    {
        if (!boardColumnId.HasValue)
        {
            return 0;
        }

        var maxPosition = await _context.Tasks
            .Where(t => t.BoardColumnId == boardColumnId.Value)
            .Select(t => (int?)t.Position)
            .MaxAsync();

        return (maxPosition ?? -1) + 1;
    }

    private long? GetCurrentUserId()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return long.TryParse(userId, out var id) ? id : null;
    }

    private static TaskSummaryResponse ToSummaryResponse(TaskItem task)
    {
        return new TaskSummaryResponse(
            task.Id,
            task.ProjectId,
            task.BoardColumnId,
            task.AssigneeId,
            task.ReporterId,
            task.Title,
            task.Description,
            task.Status,
            task.Priority,
            task.Position,
            task.DueDate,
            task.CreatedAt,
            task.UpdatedAt);
    }
}

public class CreateTaskRequest
{
    public string Title { get; set; } = null!;
    public string? Description { get; set; }
    public string? Status { get; set; }
    public string? Priority { get; set; }
    public DateTime? DueDate { get; set; }
    public long? BoardColumnId { get; set; }
    public long? AssigneeId { get; set; }
    public int? Position { get; set; }
}

public class UpdateTaskRequest
{
    public string Title { get; set; } = null!;
    public string? Description { get; set; }
    public string? Status { get; set; }
    public string? Priority { get; set; }
    public DateTime? DueDate { get; set; }
    public long? BoardColumnId { get; set; }
    public long? AssigneeId { get; set; }
    public int? Position { get; set; }
}

public class MoveTaskRequest
{
    public long? BoardColumnId { get; set; }
    public int Position { get; set; }
    public string? Status { get; set; }
}

public record TaskSummaryResponse(
    long Id,
    long ProjectId,
    long? BoardColumnId,
    long? AssigneeId,
    long? ReporterId,
    string Title,
    string? Description,
    string Status,
    string Priority,
    int Position,
    DateTime? DueDate,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record TaskDetailResponse(
    long Id,
    long ProjectId,
    long? BoardColumnId,
    long? AssigneeId,
    long? ReporterId,
    string Title,
    string? Description,
    string Status,
    string Priority,
    int Position,
    DateTime? DueDate,
    int CommentCount,
    IReadOnlyCollection<TaskLabelResponse> Labels,
    IReadOnlyCollection<TaskStatusHistoryResponse> StatusHistory,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record TaskLabelResponse(
    long Id,
    string Name,
    string Color);

public record TaskStatusHistoryResponse(
    long Id,
    string? FromStatus,
    string ToStatus,
    long? ChangedById,
    DateTime ChangedAt);
