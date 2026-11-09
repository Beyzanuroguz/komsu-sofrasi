# Komşu Sofrası

Ev yapımı yemek, tatlı ve hamur işleri için Türkçe sipariş prototipi.

## Çalıştırma

`dist/index.html` dosyasını tarayıcıda aç veya proje kökünden `python3 -m http.server 8080 --directory dist` komutunu çalıştırıp `http://localhost:8080` adresine git.

1. **Giriş yap** menüsünden **Deniz** müşteri hesabını seç.
2. **Keşfet** ekranından sepete bir ürün ekle. Teslim tarihini ve saat aralığını seçip **Onaya gönder**. Saatler Türkiye saatidir. Bu demo teslimde nakit ödemeyi kullanır.
3. **Hesap değiştir** menüsünden ürünün üreticisini seç. Üretici panelinde **Onayla** veya **Reddet** seçeneğini kullan. Onaylanan siparişleri hazırlık ve teslim adımlarıyla ilerletebilirsin. Ret ve onay öncesi müşteri iptali ayrılan stoğu geri ekler.
4. **Deniz** hesabına dönüp **Siparişlerim** bölümünde sonucu gör.

Hesaplar bu tarayıcıdaki örnek profillerdir. Örnek ürünler, fotoğraflar, sepet ve siparişler yerel depolamada saklanır. Ödeme durumu demo kaydıdır. Gerçek kullanıcı hesapları, ortak veritabanı, çevrimiçi tahsilat ve teslimat entegrasyonu sonraki sürümün kapsamıdır.

## Fotoğraf ve konum

- Üretici panelinde bir ürün eklerken veya düzenlerken JPG, PNG ya da WebP yükleyebilirsin. Fotoğraf tarayıcıda küçültülür ve ürünle birlikte saklanır.
- İlçe ve mahalleye göre aramayı denemek için Kadıköy, Kuzguncuk veya Beşiktaş yaz. Hazır ürünler İstanbul’daki örnek bölgeleri kullanır.
- Üretici teslim noktasındayken cihaz konumunu ürüne ekleyebilir. Müşteri **Konumumu kullan** seçeneğiyle 2, 5, 10 veya 25 km içinde kalan ürünleri kuş uçuşu mesafeye göre sıralayabilir. Konum izni için HTTPS veya localhost gerekir.
