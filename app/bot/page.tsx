import { BotPanel } from '@/components/BotPanel';
import { Tester } from '@/components/Tester';

export default function BotPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bot tester</h1>
        <p className="text-base-content/70">Preview command replies instantly, or start the live bot and try them in Discord.</p>
      </div>
      <Tester />
      <BotPanel />
    </div>
  );
}
