export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-inf-black via-inf-darkGray to-inf-black flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-14 h-14 border-4 border-inf-yellow/30 border-t-inf-yellow rounded-full animate-spin mx-auto mb-5" />
        <h1 className="text-white text-2xl md:text-3xl font-black mb-2">
          Lütfen bekleyiniz...
        </h1>
        <p className="text-white/60 text-sm md:text-base">Sayfa yükleniyor...</p>
      </div>
    </div>
  );
}
