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
public class BoardColumnsController : ControllerBase
{
    private readonly ApplicationDbContext _context;

    public BoardColumnsController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet("boards/{boardId:long}/columns")]
    public async Task<IActionResult> GetBoardColumns(long boardId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var projectId = await GetBoardProjectId(boardId);
        if (projectId is null || !await CanViewProject(projectId.Value, currentUserId.Value))
        {
            return NotFound(new { Message = "Board not found." });
        }

        return Ok(await GetColumnResponses(boardId));
    }

    [HttpPost("boards/{boardId:long}/columns")]
    public async Task<IActionResult> CreateBoardColumn(
        long boardId,
        [FromBody] CreateBoardColumnRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var validationError = ValidateColumn(request.Name, request.WorkInProgressLimit);
        if (validationError is not null)
        {
            return BadRequest(new { Message = validationError });
        }

        var projectId = await GetBoardProjectId(boardId);
        if (projectId is null || !await CanManageProject(projectId.Value, currentUserId.Value))
        {
            return NotFound(new { Message = "Board not found or you cannot manage it." });
        }

        var maxPosition = await _context.BoardColumns
            .Where(c => c.BoardId == boardId)
            .Select(c => (int?)c.Position)
            .MaxAsync();
        var now = DateTime.UtcNow;

        var column = new BoardColumn
        {
            BoardId = boardId,
            Name = request.Name.Trim(),
            Position = (maxPosition ?? -1) + 1,
            WorkInProgressLimit = request.WorkInProgressLimit,
            CreatedAt = now,
            UpdatedAt = now
        };

        _context.BoardColumns.Add(column);
        await _context.SaveChangesAsync();

        return Created(
            $"/api/boards/{boardId}/columns",
            ToResponse(column, taskCount: 0));
    }

    [HttpPut("columns/{columnId:long}")]
    public async Task<IActionResult> UpdateBoardColumn(
        long columnId,
        [FromBody] UpdateBoardColumnRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var validationError = ValidateColumn(request.Name, request.WorkInProgressLimit);
        if (validationError is not null)
        {
            return BadRequest(new { Message = validationError });
        }

        var column = await _context.BoardColumns
            .Include(c => c.Board)
            .SingleOrDefaultAsync(c => c.Id == columnId);

        if (column is null || !await CanManageProject(column.Board.ProjectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Column not found or you cannot manage it." });
        }

        column.Name = request.Name.Trim();
        column.WorkInProgressLimit = request.WorkInProgressLimit;
        column.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        var taskCount = await _context.Tasks.CountAsync(t => t.BoardColumnId == columnId);
        return Ok(ToResponse(column, taskCount));
    }

    [HttpPatch("boards/{boardId:long}/columns/reorder")]
    public async Task<IActionResult> ReorderBoardColumns(
        long boardId,
        [FromBody] ReorderBoardColumnsRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var projectId = await GetBoardProjectId(boardId);
        if (projectId is null || !await CanManageProject(projectId.Value, currentUserId.Value))
        {
            return NotFound(new { Message = "Board not found or you cannot manage it." });
        }

        var columns = await _context.BoardColumns
            .Where(c => c.BoardId == boardId)
            .OrderBy(c => c.Position)
            .ToListAsync();

        if (request.ColumnIds is null ||
            request.ColumnIds.Count != columns.Count ||
            request.ColumnIds.Distinct().Count() != columns.Count ||
            !request.ColumnIds.ToHashSet().SetEquals(columns.Select(c => c.Id)))
        {
            return BadRequest(new
            {
                Message = "ColumnIds must contain every column on the board exactly once."
            });
        }

        if (columns.Count == 0)
        {
            return Ok(Array.Empty<BoardColumnResponse>());
        }

        await using var transaction = await _context.Database.BeginTransactionAsync();
        var now = DateTime.UtcNow;
        var temporaryPosition = columns.Max(c => c.Position) + columns.Count + 1;

        for (var i = 0; i < columns.Count; i++)
        {
            columns[i].Position = temporaryPosition + i;
        }

        await _context.SaveChangesAsync();

        var columnsById = columns.ToDictionary(c => c.Id);
        for (var i = 0; i < request.ColumnIds.Count; i++)
        {
            var column = columnsById[request.ColumnIds[i]];
            column.Position = i;
            column.UpdatedAt = now;
        }

        await _context.SaveChangesAsync();
        await transaction.CommitAsync();

        return Ok(await GetColumnResponses(boardId));
    }

    [HttpDelete("columns/{columnId:long}")]
    public async Task<IActionResult> DeleteBoardColumn(long columnId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var column = await _context.BoardColumns
            .Include(c => c.Board)
            .SingleOrDefaultAsync(c => c.Id == columnId);

        if (column is null || !await CanManageProject(column.Board.ProjectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Column not found or you cannot manage it." });
        }

        _context.BoardColumns.Remove(column);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    private async Task<List<BoardColumnResponse>> GetColumnResponses(long boardId)
    {
        return await _context.BoardColumns
            .AsNoTracking()
            .Where(c => c.BoardId == boardId)
            .OrderBy(c => c.Position)
            .Select(c => new BoardColumnResponse(
                c.Id,
                c.Name,
                c.Position,
                c.WorkInProgressLimit,
                c.Tasks.Count,
                c.CreatedAt,
                c.UpdatedAt))
            .ToListAsync();
    }

    private async Task<long?> GetBoardProjectId(long boardId)
    {
        return await _context.Boards
            .AsNoTracking()
            .Where(b => b.Id == boardId)
            .Select(b => (long?)b.ProjectId)
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

    private static string? ValidateColumn(string? name, int? workInProgressLimit)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return "Column name is required.";
        }

        if (name.Trim().Length > 100)
        {
            return "Column name cannot exceed 100 characters.";
        }

        if (workInProgressLimit is <= 0)
        {
            return "Work-in-progress limit must be greater than zero when provided.";
        }

        return null;
    }

    private static BoardColumnResponse ToResponse(BoardColumn column, int taskCount)
    {
        return new BoardColumnResponse(
            column.Id,
            column.Name,
            column.Position,
            column.WorkInProgressLimit,
            taskCount,
            column.CreatedAt,
            column.UpdatedAt);
    }
}

public class CreateBoardColumnRequest
{
    public string Name { get; set; } = null!;
    public int? WorkInProgressLimit { get; set; }
}

public class UpdateBoardColumnRequest
{
    public string Name { get; set; } = null!;
    public int? WorkInProgressLimit { get; set; }
}

public class ReorderBoardColumnsRequest
{
    public List<long> ColumnIds { get; set; } = [];
}
