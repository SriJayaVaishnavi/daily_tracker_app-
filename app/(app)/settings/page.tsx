import NotificationManager from '@/components/NotificationManager';
import ReminderSettings from '@/components/ReminderSettings';
import QuietHoursSettings from '@/components/QuietHoursSettings';
import RunDueRemindersButton from '@/components/RunDueRemindersButton';
import ThemeToggle from '@/components/ThemeToggle';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-fg">Manage how Routine reaches you.</p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-serif text-lg font-semibold text-foreground">Notifications</h2>
        <p className="mb-4 mt-1 text-sm text-muted-fg">
          Get reminders and your daily brief as push notifications on this device.
        </p>
        <NotificationManager />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-serif text-lg font-semibold text-foreground">Reminders</h2>
        <p className="mb-2 mt-1 text-sm text-muted-fg">
          Schedule a morning brief and a mood check-in. Task reminders are created
          automatically for habits with a time.
        </p>
        <ReminderSettings />
        <QuietHoursSettings />
        <RunDueRemindersButton />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-serif text-lg font-semibold text-foreground">Appearance</h2>
        <p className="mb-4 mt-1 text-sm text-muted-fg">Choose your theme.</p>
        <ThemeToggle />
      </section>
    </div>
  );
}
