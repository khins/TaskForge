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
public class AttachmentsController : ControllerBase
{
    private const long MaxFileSizeBytes = 10 * 1024 * 1024;
    private readonly ApplicationDbContext _context;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<AttachmentsController> _logger;
    private readonly string _storageRoot;

    public AttachmentsController(
        ApplicationDbContext context,
        IWebHostEnvironment environment,
        ILogger<AttachmentsController> logger)
    {
        _context = context;
        _environment = environment;
        _logger = logger;
        _storageRoot = Path.Combine(environment.ContentRootPath, "storage", "attachments");
    }

    [HttpGet("tasks/{taskId:long}/attachments")]
    public async Task<IActionResult> GetTaskAttachments(long taskId)
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

        var attachments = await _context.Attachments
            .AsNoTracking()
            .Where(a => a.TaskId == taskId)
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new AttachmentResponse(
                a.Id,
                a.TaskId,
                a.UploadedById,
                a.UploadedBy.FullName ?? a.UploadedBy.Email,
                a.FileName,
                a.ContentType,
                a.SizeBytes,
                a.CreatedAt))
            .ToListAsync();

        return Ok(attachments);
    }

    [HttpPost("tasks/{taskId:long}/attachments")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaxFileSizeBytes)]
    public async Task<IActionResult> UploadAttachment(
        long taskId,
        [FromForm] UploadAttachmentRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        if (request.File is null || request.File.Length == 0)
        {
            return BadRequest(new { Message = "A non-empty file is required." });
        }

        if (request.File.Length > MaxFileSizeBytes)
        {
            return BadRequest(new { Message = "The file cannot exceed 10 MB." });
        }

        var fileName = Path.GetFileName(request.File.FileName);
        if (string.IsNullOrWhiteSpace(fileName) || fileName.Length > 255)
        {
            return BadRequest(new { Message = "The file name is invalid or exceeds 255 characters." });
        }

        var projectId = await GetTaskProjectId(taskId);
        if (projectId is null || !await CanViewProject(projectId.Value, currentUserId.Value))
        {
            return NotFound(new { Message = "Task not found." });
        }

        var extension = Path.GetExtension(fileName);
        if (extension.Length > 20)
        {
            extension = string.Empty;
        }

        var taskDirectory = Path.Combine(_storageRoot, taskId.ToString());
        Directory.CreateDirectory(taskDirectory);

        var storedFileName = $"{Guid.NewGuid():N}{extension.ToLowerInvariant()}";
        var fullPath = Path.Combine(taskDirectory, storedFileName);

        await using (var stream = new FileStream(
                         fullPath,
                         FileMode.CreateNew,
                         FileAccess.Write,
                         FileShare.None,
                         bufferSize: 81920,
                         useAsync: true))
        {
            await request.File.CopyToAsync(stream);
        }

        var attachment = new Attachment
        {
            TaskId = taskId,
            UploadedById = currentUserId.Value,
            FileName = fileName,
            StoragePath = Path.GetRelativePath(_environment.ContentRootPath, fullPath).Replace('\\', '/'),
            ContentType = string.IsNullOrWhiteSpace(request.File.ContentType)
                ? "application/octet-stream"
                : request.File.ContentType,
            SizeBytes = request.File.Length,
            CreatedAt = DateTime.UtcNow
        };

        try
        {
            _context.Attachments.Add(attachment);
            await _context.SaveChangesAsync();
        }
        catch
        {
            System.IO.File.Delete(fullPath);
            throw;
        }

        var uploaderName = await _context.Users
            .Where(u => u.Id == currentUserId.Value)
            .Select(u => u.FullName ?? u.Email)
            .SingleAsync();

        return CreatedAtAction(
            nameof(DownloadAttachment),
            new { id = attachment.Id },
            ToResponse(attachment, uploaderName));
    }

    [HttpGet("attachments/{id:long}/download")]
    public async Task<IActionResult> DownloadAttachment(long id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var attachment = await _context.Attachments
            .AsNoTracking()
            .Include(a => a.Task)
            .SingleOrDefaultAsync(a => a.Id == id);

        if (attachment is null || !await CanViewProject(attachment.Task.ProjectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Attachment not found." });
        }

        var fullPath = ResolveStoragePath(attachment.StoragePath);
        if (fullPath is null || !System.IO.File.Exists(fullPath))
        {
            return NotFound(new { Message = "The attachment file is missing from storage." });
        }

        return PhysicalFile(
            fullPath,
            attachment.ContentType ?? "application/octet-stream",
            attachment.FileName);
    }

    [HttpDelete("attachments/{id:long}")]
    public async Task<IActionResult> DeleteAttachment(long id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var attachment = await _context.Attachments
            .Include(a => a.Task)
            .SingleOrDefaultAsync(a => a.Id == id);

        if (attachment is null || !await CanViewProject(attachment.Task.ProjectId, currentUserId.Value))
        {
            return NotFound(new { Message = "Attachment not found." });
        }

        if (!await CanManageAttachment(attachment, currentUserId.Value))
        {
            return Forbid();
        }

        var fullPath = ResolveStoragePath(attachment.StoragePath);
        _context.Attachments.Remove(attachment);
        await _context.SaveChangesAsync();

        if (fullPath is not null && System.IO.File.Exists(fullPath))
        {
            try
            {
                System.IO.File.Delete(fullPath);
            }
            catch (IOException exception)
            {
                _logger.LogWarning(
                    exception,
                    "Attachment {AttachmentId} was deleted from the database, but its stored file could not be removed.",
                    id);
            }
        }

        return NoContent();
    }

    private string? ResolveStoragePath(string storagePath)
    {
        var fullPath = Path.GetFullPath(Path.Combine(
            _environment.ContentRootPath,
            storagePath.Replace('/', Path.DirectorySeparatorChar)));
        var storageRoot = Path.GetFullPath(_storageRoot) + Path.DirectorySeparatorChar;

        return fullPath.StartsWith(storageRoot, StringComparison.OrdinalIgnoreCase)
            ? fullPath
            : null;
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
        return await _context.Projects.AnyAsync(p =>
            p.Id == projectId &&
            (p.OwnerId == userId || p.Members.Any(m => m.UserId == userId)));
    }

    private async Task<bool> CanManageAttachment(Attachment attachment, long userId)
    {
        if (attachment.UploadedById == userId)
        {
            return true;
        }

        return await _context.Projects.AnyAsync(p =>
            p.Id == attachment.Task.ProjectId &&
            (p.OwnerId == userId || p.Members.Any(m =>
                m.UserId == userId && (m.Role == "owner" || m.Role == "admin"))));
    }

    private long? GetCurrentUserId()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return long.TryParse(userId, out var id) ? id : null;
    }

    private static AttachmentResponse ToResponse(Attachment attachment, string uploaderName)
    {
        return new AttachmentResponse(
            attachment.Id,
            attachment.TaskId,
            attachment.UploadedById,
            uploaderName,
            attachment.FileName,
            attachment.ContentType,
            attachment.SizeBytes,
            attachment.CreatedAt);
    }
}

public class UploadAttachmentRequest
{
    public IFormFile File { get; set; } = null!;
}

public record AttachmentResponse(
    long Id,
    long TaskId,
    long UploadedById,
    string UploadedByName,
    string FileName,
    string? ContentType,
    long SizeBytes,
    DateTime CreatedAt);
