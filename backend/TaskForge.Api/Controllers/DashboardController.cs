using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskForge.Api.Data;

namespace TaskForge.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly ApplicationDbContext _context;

    public DashboardController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetDashboard()
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var now = DateTime.UtcNow;
        var dueSoonCutoff = now.AddDays(7);
        var isGlobalAdmin = User.IsInRole("admin");
        var accessibleProjects = _context.Projects
            .AsNoTracking()
            .Where(p =>
                isGlobalAdmin ||
                p.OwnerId == currentUserId.Value ||
                p.Members.Any(m => m.UserId == currentUserId.Value));
        var accessibleTasks = _context.Tasks
            .AsNoTracking()
            .Where(t =>
                t.ParentTaskId == null &&
                t.ArchivedAt == null &&
                (isGlobalAdmin ||
                 t.Project.OwnerId == currentUserId.Value ||
                 t.Project.Members.Any(m => m.UserId == currentUserId.Value)));

        var projectCount = await accessibleProjects.CountAsync();
        var taskCount = await accessibleTasks.CountAsync();
        var assignedToMeCount = await accessibleTasks
            .CountAsync(t => t.AssigneeId == currentUserId.Value);
        var overdueCount = await accessibleTasks
            .CountAsync(t =>
                t.DueDate != null &&
                t.DueDate < now &&
                t.Status != "Done");
        var dueSoonCount = await accessibleTasks
            .CountAsync(t =>
                t.DueDate != null &&
                t.DueDate >= now &&
                t.DueDate <= dueSoonCutoff &&
                t.Status != "Done");

        var statusCounts = await accessibleTasks
            .GroupBy(t => t.Status)
            .Select(group => new { Name = group.Key, Count = group.Count() })
            .OrderByDescending(group => group.Count)
            .ThenBy(group => group.Name)
            .ToListAsync();
        var tasksByStatus = statusCounts
            .Select(group => new DashboardGroupCount(group.Name, group.Count))
            .ToList();

        var priorityCounts = await accessibleTasks
            .GroupBy(t => t.Priority)
            .Select(group => new { Name = group.Key, Count = group.Count() })
            .OrderByDescending(group => group.Count)
            .ThenBy(group => group.Name)
            .ToListAsync();
        var tasksByPriority = priorityCounts
            .Select(group => new DashboardGroupCount(group.Name, group.Count))
            .ToList();

        var recentTasks = await accessibleTasks
            .OrderByDescending(t => t.UpdatedAt)
            .ThenByDescending(t => t.CreatedAt)
            .Take(10)
            .Select(t => new DashboardTaskResponse(
                t.Id,
                t.ProjectId,
                t.BoardColumn != null ? t.BoardColumn.BoardId : null,
                t.Project.Name,
                t.Title,
                t.Status,
                t.Priority,
                t.AssigneeId,
                t.DueDate,
                t.UpdatedAt))
            .ToListAsync();

        var overdueTasks = await accessibleTasks
            .Where(t =>
                t.DueDate != null &&
                t.DueDate < now &&
                t.Status != "Done")
            .OrderBy(t => t.DueDate)
            .Take(10)
            .Select(t => new DashboardTaskResponse(
                t.Id,
                t.ProjectId,
                t.BoardColumn != null ? t.BoardColumn.BoardId : null,
                t.Project.Name,
                t.Title,
                t.Status,
                t.Priority,
                t.AssigneeId,
                t.DueDate,
                t.UpdatedAt))
            .ToListAsync();

        return Ok(new DashboardResponse(
            projectCount,
            taskCount,
            assignedToMeCount,
            overdueCount,
            dueSoonCount,
            tasksByStatus,
            tasksByPriority,
            recentTasks,
            overdueTasks));
    }

    private long? GetCurrentUserId()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return long.TryParse(userId, out var id) ? id : null;
    }
}

public record DashboardResponse(
    int ProjectCount,
    int TaskCount,
    int AssignedToMeCount,
    int OverdueCount,
    int DueSoonCount,
    IReadOnlyCollection<DashboardGroupCount> TasksByStatus,
    IReadOnlyCollection<DashboardGroupCount> TasksByPriority,
    IReadOnlyCollection<DashboardTaskResponse> RecentTasks,
    IReadOnlyCollection<DashboardTaskResponse> OverdueTasks);

public record DashboardGroupCount(
    string Name,
    int Count);

public record DashboardTaskResponse(
    long Id,
    long ProjectId,
    long? BoardId,
    string ProjectName,
    string Title,
    string Status,
    string Priority,
    long? AssigneeId,
    DateTime? DueDate,
    DateTime UpdatedAt);
