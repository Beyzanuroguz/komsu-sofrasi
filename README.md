# Komşu Sofrası

Ev yapımı yemek, tatlı ve hamur işleri için sipariş uygulaması. Müşteriler teslim zamanı seçip sipariş talebi gönderir. Üreticiler kendi ürünlerini ve kendilerine gelen talepleri yönetir. Tamamlanan, reddedilen ve iptal edilen siparişler müşterinin **Geçmiş siparişler** bölümünde saklanır.

## Kullanım

1. Siteye hesabınla giriş yap. **Üretici paneli** bölümünden mutfağını aç. Elden teslim bilgisi, onaylanmış elden teslim siparişlerinin müşterilerine gösterilir.
2. Ürün adı, fiyat, stok ve satış birimini gir. İstersen fotoğraf ve yaklaşık teslim bölgesi ekle. Kilogramla satılan ürünler yarım kilo adımlarıyla sipariş edilebilir.
3. Başka bir yetkili hesapla **Müşteri girişi** üzerinden giriş yap. **Keşfet** ekranından ürünü sepete ekle. Teslim şekli, tarih ve saat seçip siparişi onaya gönder.
4. Üretici hesabında **Gelen siparişler** bölümünden talebi onayla veya reddet. Teslim sırasında nakit alındığında üretici siparişi tamamlar.

Gerçek katalog üreticilerin yayımladığı ürünlerle doldurulur. Cihaz konumu yanıt vermezse katalogdaki bölgelerden biriyle filtreleme yapılabilir. Önceki prototip siparişleri sunucuya aktarılmaz. Gerçek siparişler için ödeme yöntemi teslimde nakittir.

## Şifreli test alanı

Siteye erişimi olan kişi `/test/musteri/` adresinde `musteri`, `/test/uretici/` adresinde `uretici` hesabıyla giriş yapabilir. Her rolün oturumu kendi yolunda saklanır. Böylece aynı tarayıcıdaki iki sekmede müşteri sipariş verebilir ve üretici onaylayabilir. İlk başarılı giriş, test mutfağını ve fotoğraflı ürünlerini veritabanına bir kez ekler. Test siparişleri gerçek katalog ve siparişlerden ayrıdır. Fotoğraf kaynakları [test kataloğu atıflarında](public/test-media/ATTRIBUTION.md) listelenir.

Test girişini etkinleştirmek için Sites ortamında `TEST_CREDENTIALS` adlı bir secret tanımlanır. JSON biçimi, `key` alanında 64 karakterlik rastgele hex anahtar ve `hashes` altında `musteri` ile `uretici` için ayrı SHA-256 parola özetleri içerir. Test şifreleri ve imza anahtarı kaynak kodda saklanmaz.

## Geliştirme ve yayın

`npm run build` bağımlılık kurmadan `dist/server/index.js` oluşturur. Worker, Sites’ın sağladığı doğrulanmış kullanıcı kimliğini, D1 `DB` bağını ve R2 `BUCKET` bağını kullanır. `drizzle/0000_marketplace.sql` şemayı oluşturur. Sites üzerinden yayınlarken bu bağlantılar ve şema Sites tarafından hazırlanır.

Ürünler ve siparişler D1'de, fotoğraflar R2'de saklanır. Sepet geçici tarayıcı oturumunda tutulur. Yönetim işlemleri için kullanıcı kimliği ve ürün ya da sipariş sahipliği sunucuda doğrulanır. Sipariş onayı ve stok hareketleri veritabanında tutulur. Teslimat iletişim bilgileri yalnızca ilgili siparişin taraflarına gösterilir.
