export default function AdminLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-white/25 border-t-white rounded-full animate-spin mx-auto mb-4" />
        <h2 className="text-white text-2xl font-black mb-2">Lütfen bekleyiniz...</h2>
        <p className="text-white/60 text-sm">Sayfa yükleniyor...</p>
      </div>
    </div>
  );
}
