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
public class BoardsController : ControllerBase
{
    private static readonly string[] DefaultColumnNames = ["Todo", "In Progress", "Done"];

    private readonly ApplicationDbContext _context;

    public BoardsController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet("projects/{projectId:long}/boards")]
    public async Task<IActionResult> GetProjectBoards(long projectId)
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

        var boards = await _context.Boards
            .AsNoTracking()
            .Where(b => b.ProjectId == projectId)
            .OrderBy(b => b.CreatedAt)
            .Select(b => new BoardSummaryResponse(
                b.Id,
                b.ProjectId,
                b.Name,
                b.Description,
                b.Columns.Count,
                b.CreatedAt,
                b.UpdatedAt))
            .ToListAsync();

        return Ok(boards);
    }

    [HttpGet("boards/{id:long}")]
    public async Task<IActionResult> GetBoard(long id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var boardProjectId = await _context.Boards
            .AsNoTracking()
            .Where(b => b.Id == id)
            .Select(b => (long?)b.ProjectId)
            .SingleOrDefaultAsync();

        if (boardProjectId is null || !await CanViewProject(boardProjectId.Value, currentUserId.Value))
        {
            return NotFound(new { Message = "Board not found." });
        }

        var board = await _context.Boards
            .AsNoTracking()
            .Where(b => b.Id == id)
            .Select(b => new BoardDetailResponse(
                b.Id,
                b.ProjectId,
                b.Name,
                b.Description,
                b.Columns
                    .OrderBy(c => c.Position)
                    .Select(c => new BoardColumnResponse(
                        c.Id,
                        c.Name,
                        c.Position,
                        c.WorkInProgressLimit,
                        c.Tasks.Count,
                        c.CreatedAt,
                        c.UpdatedAt))
                    .ToList(),
                b.CreatedAt,
                b.UpdatedAt))
            .SingleAsync();

        return Ok(board);
    }

    [HttpPost("projects/{projectId:long}/boards")]
    public async Task<IActionResult> CreateBoard(long projectId, [FromBody] CreateBoardRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new { Message = "Board name is required." });
        }

        if (!await CanManageProject(projectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Project not found." });
        }

        var now = DateTime.UtcNow;
        var board = new Board
        {
            ProjectId = projectId,
            Name = request.Name.Trim(),
            Description = request.Description,
            CreatedAt = now,
            UpdatedAt = now
        };

        if (request.CreateDefaultColumns)
        {
            for (var i = 0; i < DefaultColumnNames.Length; i++)
            {
                board.Columns.Add(new BoardColumn
                {
                    Name = DefaultColumnNames[i],
                    Position = i,
                    CreatedAt = now,
                    UpdatedAt = now
                });
            }
        }

        _context.Boards.Add(board);
        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetBoard),
            new { id = board.Id },
            new BoardSummaryResponse(
                board.Id,
                board.ProjectId,
                board.Name,
                board.Description,
                board.Columns.Count,
                board.CreatedAt,
                board.UpdatedAt));
    }

    [HttpPut("boards/{id:long}")]
    public async Task<IActionResult> UpdateBoard(long id, [FromBody] UpdateBoardRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new { Message = "Board name is required." });
        }

        var board = await _context.Boards.SingleOrDefaultAsync(b => b.Id == id);
        if (board is null || !await CanManageProject(board.ProjectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Board not found." });
        }

        board.Name = request.Name.Trim();
        board.Description = request.Description;
        board.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new BoardSummaryResponse(
            board.Id,
            board.ProjectId,
            board.Name,
            board.Description,
            await _context.BoardColumns.CountAsync(c => c.BoardId == board.Id),
            board.CreatedAt,
            board.UpdatedAt));
    }

    [HttpDelete("boards/{id:long}")]
    public async Task<IActionResult> DeleteBoard(long id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var board = await _context.Boards.SingleOrDefaultAsync(b => b.Id == id);
        if (board is null || !await CanManageProject(board.ProjectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Board not found." });
        }

        _context.Boards.Remove(board);
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

    private async Task<bool> CanManageProject(long projectId, long userId)
    {
        if (User.IsInRole("admin")) return await _context.Projects.AnyAsync(p => p.Id == projectId);
        return await _context.Projects.AnyAsync(p =>
            p.Id == projectId &&
            (p.OwnerId == userId || p.Members.Any(m =>
                m.UserId == userId &&
                (m.Role == "owner" || m.Role == "admin"))));
    }

    private long? GetCurrentUserId()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return long.TryParse(userId, out var id) ? id : null;
    }
}

public class CreateBoardRequest
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public bool CreateDefaultColumns { get; set; } = true;
}

public class UpdateBoardRequest
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
}

public record BoardSummaryResponse(
    long Id,
    long ProjectId,
    string Name,
    string? Description,
    int ColumnCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record BoardDetailResponse(
    long Id,
    long ProjectId,
    string Name,
    string? Description,
    IReadOnlyCollection<BoardColumnResponse> Columns,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record BoardColumnResponse(
    long Id,
    string Name,
    int Position,
    int? WorkInProgressLimit,
    int TaskCount,
    DateTime CreatedAt,
    DateTime UpdatedAt);
