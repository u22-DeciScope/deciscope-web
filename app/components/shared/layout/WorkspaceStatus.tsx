type WorkspaceStatusProps = {
  message: string;
};

export function WorkspaceStatus({ message }: WorkspaceStatusProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-(--ds-bg) p-4 text-sm text-(--text-muted)">
      {message}
    </main>
  );
}
