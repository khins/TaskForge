namespace TaskForge.Api.Models;

public class ProjectMember
{
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public long UserId { get; set; }
    public User User { get; set; } = null!;
    public string Role { get; set; } = "member";
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
}

public class Board
{
    public long Id { get; set; }
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<BoardColumn> Columns { get; set; } = new List<BoardColumn>();
}

public class BoardColumn
{
    public long Id { get; set; }
    public long BoardId { get; set; }
    public Board Board { get; set; } = null!;
    public string Name { get; set; } = null!;
    public int Position { get; set; }
    public int? WorkInProgressLimit { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<TaskItem> Tasks { get; set; } = new List<TaskItem>();
}

public class TaskComment
{
    public long Id { get; set; }
    public long TaskId { get; set; }
    public TaskItem Task { get; set; } = null!;
    public long AuthorId { get; set; }
    public User Author { get; set; } = null!;
    public string Body { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class TaskStatusHistory
{
    public long Id { get; set; }
    public long TaskId { get; set; }
    public TaskItem Task { get; set; } = null!;
    public string? FromStatus { get; set; }
    public string ToStatus { get; set; } = null!;
    public long? ChangedById { get; set; }
    public User? ChangedBy { get; set; }
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
}

public class Label
{
    public long Id { get; set; }
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string Color { get; set; } = "#6B7280";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<TaskLabel> TaskLabels { get; set; } = new List<TaskLabel>();
}

public class TaskLabel
{
    public long TaskId { get; set; }
    public TaskItem Task { get; set; } = null!;
    public long LabelId { get; set; }
    public Label Label { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Attachment
{
    public long Id { get; set; }
    public long TaskId { get; set; }
    public TaskItem Task { get; set; } = null!;
    public long UploadedById { get; set; }
    public User UploadedBy { get; set; } = null!;
    public string FileName { get; set; } = null!;
    public string StoragePath { get; set; } = null!;
    public string? ContentType { get; set; }
    public long SizeBytes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
