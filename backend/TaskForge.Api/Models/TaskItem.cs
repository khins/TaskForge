namespace TaskForge.Api.Models;

public class TaskItem
{
    public long Id { get; set; }
    public string Title { get; set; } = null!;
    public string? Description { get; set; }
    public string Status { get; set; } = "Todo";
    public string Priority { get; set; } = "Medium";
    public DateTime? DueDate { get; set; }
    public DateTime? ArchivedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public long? BoardColumnId { get; set; }
    public BoardColumn? BoardColumn { get; set; }
    public long? AssigneeId { get; set; }
    public User? Assignee { get; set; }
    public long? ReporterId { get; set; }
    public User? Reporter { get; set; }
    public int Position { get; set; }

    public ICollection<TaskComment> Comments { get; set; } = new List<TaskComment>();
    public ICollection<TaskStatusHistory> StatusHistory { get; set; } = new List<TaskStatusHistory>();
    public ICollection<TaskLabel> TaskLabels { get; set; } = new List<TaskLabel>();
    public ICollection<Attachment> Attachments { get; set; } = new List<Attachment>();
}
