import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';

export default function StudioTakeCompositionEntry() {
  const { takeId } = useParams<{ takeId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!takeId) return;
    let cancelled = false;
    void window.electron.ipc
      .invoke<{ id: string }>('studio:composition-default-for-take', { takeId })
      .then((composition) => {
        if (cancelled) return null;
        navigate(`/studio/compositions/${composition.id}`, { replace: true });
        return composition;
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not open the recording in Studio.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, navigate, takeId]);

  if (error) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center">
        <h1 className="text-base font-semibold">Could not open recording</h1>
        <p role="alert" className="max-w-md text-sm text-muted-foreground">
          {error}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/studio')}>
            Back to recordings
          </Button>
          <Button onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen items-center justify-center bg-background p-8">
      <p role="status" className="text-sm text-muted-foreground">
        Opening the recording&apos;s composition…
      </p>
    </main>
  );
}
