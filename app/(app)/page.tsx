import { todayRoutine } from '@/lib/routine';
import RoutineView from '@/components/RoutineView';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const routine = await todayRoutine(new Date());
  return <RoutineView routine={routine} />;
}
