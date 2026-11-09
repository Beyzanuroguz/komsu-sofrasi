# Komşu Sofrası

Ev yapımı yemek, tatlı ve hamur işleri için Türkçe sipariş prototipi.

## Çalıştırma

`dist/index.html` dosyasını tarayıcıda aç veya proje kökünden `python3 -m http.server 8080 --directory dist` komutunu çalıştırıp `http://localhost:8080` adresine git.

1. **Keşfet** ekranından sepetine bir ürün ekle ve örnek bir adla demo sipariş oluştur.
2. **Üretici paneli** ekranında siparişi bul ve durumunu değiştir. Aynı ekrandan ürün ekleyebilir veya stok ve fiyat düzenleyebilirsin.
3. **Keşfet → Siparişlerim** bölümünde güncellenen durumu kontrol et.

Örnek ürünler, sepet ve siparişler tarayıcının yerel depolamasında saklanır. Müşteri ve üretici ekranı aynı tarayıcıdaki ortak demo verisini kullanır. Gerçek kullanıcı hesapları, ortak veritabanı, ödeme, mesaj bildirimleri ve teslimat entegrasyonu sonraki sürümün kapsamıdır.


## Fotoğraf ve konum

- Üretici panelinde bir ürün eklerken veya düzenlerken JPG, PNG ya da WebP yükleyebilirsin. Fotoğraf tarayıcıda küçültülür ve ürünle birlikte saklanır.
- İlçe ve mahalleye göre aramayı denemek için Kadıköy, Kuzguncuk veya Beşiktaş yaz. Hazır ürünler İstanbul’daki örnek bölgeleri kullanır.
- Üretici teslim noktasındayken cihaz konumunu ürüne ekleyebilir. Müşteri **Konumumu kullan** seçeneğiyle 2, 5, 10 veya 25 km içinde kalan ürünleri kuş uçuşu mesafeye göre sıralayabilir. Konum izni için HTTPS veya localhost gerekir.
