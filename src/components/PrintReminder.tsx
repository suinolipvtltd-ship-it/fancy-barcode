interface PrintReminderProps {
  visible: boolean;
}

export default function PrintReminder({ visible }: PrintReminderProps) {
  if (!visible) return null;

  return (
    <div
      role="status"
      className="rounded border border-blue-200 bg-blue-50 p-4"
    >
      <p className="text-sm font-medium text-blue-800">
        🖨️ When printing, set <strong>Margins: None</strong> and{" "}
        <strong>Scale: 100%</strong> for accurate label dimensions.
      </p>
    </div>
  );
}
