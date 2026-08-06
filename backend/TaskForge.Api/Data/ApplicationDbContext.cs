using Microsoft.EntityFrameworkCore;
using TaskForge.Api.Models;

namespace TaskForge.Api.Data;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<ProjectMember> ProjectMembers => Set<ProjectMember>();
    public DbSet<Board> Boards => Set<Board>();
    public DbSet<BoardColumn> BoardColumns => Set<BoardColumn>();
    public DbSet<TaskComment> TaskComments => Set<TaskComment>();
    public DbSet<TaskStatusHistory> TaskStatusHistory => Set<TaskStatusHistory>();
    public DbSet<Label> Labels => Set<Label>();
    public DbSet<TaskLabel> TaskLabels => Set<TaskLabel>();
    public DbSet<Attachment> Attachments => Set<Attachment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.Email).HasColumnName("email").HasMaxLength(255);
            entity.Property(x => x.PasswordHash).HasColumnName("password_hash").HasMaxLength(255);
            entity.Property(x => x.FullName).HasColumnName("full_name").HasMaxLength(255);
            entity.Property(x => x.Role).HasColumnName("role").HasMaxLength(50);
            entity.Property(x => x.IsActive).HasColumnName("is_active");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => x.Email).IsUnique();
        });

        modelBuilder.Entity<Project>(entity =>
        {
            entity.ToTable("projects");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(200);
            entity.Property(x => x.Description).HasColumnName("description");
            entity.Property(x => x.OwnerId).HasColumnName("owner_id");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasOne(x => x.Owner).WithMany(x => x.OwnedProjects)
                .HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ProjectMember>(entity =>
        {
            entity.ToTable("project_members");
            entity.HasKey(x => new { x.ProjectId, x.UserId });
            entity.Property(x => x.ProjectId).HasColumnName("project_id");
            entity.Property(x => x.UserId).HasColumnName("user_id");
            entity.Property(x => x.Role).HasColumnName("role").HasMaxLength(50);
            entity.Property(x => x.JoinedAt).HasColumnName("joined_at");
            entity.HasOne(x => x.Project).WithMany(x => x.Members)
                .HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.User).WithMany(x => x.ProjectMemberships)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Board>(entity =>
        {
            entity.ToTable("boards");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.ProjectId).HasColumnName("project_id");
            entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(200);
            entity.Property(x => x.Description).HasColumnName("description");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasOne(x => x.Project).WithMany(x => x.Boards)
                .HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BoardColumn>(entity =>
        {
            entity.ToTable("board_columns");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.BoardId).HasColumnName("board_id");
            entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(100);
            entity.Property(x => x.Position).HasColumnName("position");
            entity.Property(x => x.WorkInProgressLimit).HasColumnName("work_in_progress_limit");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => new { x.BoardId, x.Position }).IsUnique();
            entity.HasOne(x => x.Board).WithMany(x => x.Columns)
                .HasForeignKey(x => x.BoardId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<TaskItem>(entity =>
        {
            entity.ToTable("tasks");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.ProjectId).HasColumnName("project_id");
            entity.Property(x => x.BoardColumnId).HasColumnName("board_column_id");
            entity.Property(x => x.AssigneeId).HasColumnName("assignee_id");
            entity.Property(x => x.ReporterId).HasColumnName("reporter_id");
            entity.Property(x => x.Title).HasColumnName("title").HasMaxLength(300);
            entity.Property(x => x.Description).HasColumnName("description");
            entity.Property(x => x.Status).HasColumnName("status").HasMaxLength(50);
            entity.Property(x => x.Priority).HasColumnName("priority").HasMaxLength(50);
            entity.Property(x => x.Position).HasColumnName("position");
            entity.Property(x => x.DueDate).HasColumnName("due_date");
            entity.Property(x => x.ArchivedAt).HasColumnName("archived_at");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasOne(x => x.Project).WithMany(x => x.Tasks)
                .HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.BoardColumn).WithMany(x => x.Tasks)
                .HasForeignKey(x => x.BoardColumnId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(x => x.Assignee).WithMany()
                .HasForeignKey(x => x.AssigneeId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(x => x.Reporter).WithMany()
                .HasForeignKey(x => x.ReporterId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<TaskComment>(entity =>
        {
            entity.ToTable("task_comments");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.TaskId).HasColumnName("task_id");
            entity.Property(x => x.AuthorId).HasColumnName("author_id");
            entity.Property(x => x.Body).HasColumnName("body");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasOne(x => x.Task).WithMany(x => x.Comments)
                .HasForeignKey(x => x.TaskId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Author).WithMany()
                .HasForeignKey(x => x.AuthorId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<TaskStatusHistory>(entity =>
        {
            entity.ToTable("task_status_history");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.TaskId).HasColumnName("task_id");
            entity.Property(x => x.FromStatus).HasColumnName("from_status").HasMaxLength(50);
            entity.Property(x => x.ToStatus).HasColumnName("to_status").HasMaxLength(50);
            entity.Property(x => x.ChangedById).HasColumnName("changed_by_id");
            entity.Property(x => x.ChangedAt).HasColumnName("changed_at");
            entity.HasOne(x => x.Task).WithMany(x => x.StatusHistory)
                .HasForeignKey(x => x.TaskId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.ChangedBy).WithMany()
                .HasForeignKey(x => x.ChangedById).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Label>(entity =>
        {
            entity.ToTable("labels");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.ProjectId).HasColumnName("project_id");
            entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(100);
            entity.Property(x => x.Color).HasColumnName("color").HasMaxLength(20);
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(x => new { x.ProjectId, x.Name }).IsUnique();
            entity.HasOne(x => x.Project).WithMany(x => x.Labels)
                .HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<TaskLabel>(entity =>
        {
            entity.ToTable("task_labels");
            entity.HasKey(x => new { x.TaskId, x.LabelId });
            entity.Property(x => x.TaskId).HasColumnName("task_id");
            entity.Property(x => x.LabelId).HasColumnName("label_id");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.HasOne(x => x.Task).WithMany(x => x.TaskLabels)
                .HasForeignKey(x => x.TaskId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Label).WithMany(x => x.TaskLabels)
                .HasForeignKey(x => x.LabelId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Attachment>(entity =>
        {
            entity.ToTable("attachments");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id");
            entity.Property(x => x.TaskId).HasColumnName("task_id");
            entity.Property(x => x.UploadedById).HasColumnName("uploaded_by_id");
            entity.Property(x => x.FileName).HasColumnName("file_name").HasMaxLength(255);
            entity.Property(x => x.StoragePath).HasColumnName("storage_path").HasMaxLength(1000);
            entity.Property(x => x.ContentType).HasColumnName("content_type").HasMaxLength(255);
            entity.Property(x => x.SizeBytes).HasColumnName("size_bytes");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.HasOne(x => x.Task).WithMany(x => x.Attachments)
                .HasForeignKey(x => x.TaskId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.UploadedBy).WithMany()
                .HasForeignKey(x => x.UploadedById).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
