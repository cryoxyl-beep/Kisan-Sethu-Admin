export default function Placeholders({ title }: { title: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-8 flex flex-col items-center justify-center min-h-[400px] text-center">
      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
        <span className="text-2xl text-gray-400">🚧</span>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{title}</h2>
      <p className="text-gray-500 max-w-sm">
        This section is currently under development. It will be available in the next phase of the admin dashboard rollout.
      </p>
    </div>
  );
}
