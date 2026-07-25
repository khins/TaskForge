namespace TaskForge.Api.Models;

public class Project
{
    public long Id { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public long? OwnerId { get; set; }
    public User? Owner { get; set; }

    public ICollection<TaskItem> Tasks { get; set; } = new List<TaskItem>();
    public ICollection<ProjectMember> Members { get; set; } = new List<ProjectMember>();
    public ICollection<Board> Boards { get; set; } = new List<Board>();
    public ICollection<Label> Labels { get; set; } = new List<Label>();
}
