# Komşu Sofrası

Ev yapımı yemek, tatlı ve hamur işleri için sipariş uygulaması. Müşteriler teslim zamanı seçip sipariş talebi gönderir. Üreticiler kendi ürünlerini ve kendilerine gelen talepleri yönetir. Tamamlanan, reddedilen ve iptal edilen siparişler müşterinin **Geçmiş siparişler** bölümünde saklanır.

## Kullanım

1. Siteye hesabınla giriş yap. **Üretici paneli** bölümünden mutfağını aç. Elden teslim bilgisi, onaylanmış elden teslim siparişlerinin müşterilerine gösterilir.
2. Ürün adı, fiyat, stok ve satış birimini gir. İstersen fotoğraf ve yaklaşık teslim bölgesi ekle. Kilogramla satılan ürünler yarım kilo adımlarıyla sipariş edilebilir.
3. Başka bir yetkili hesapla **Keşfet** ekranından ürünü sepete ekle. Teslim şekli, tarih ve saat seçip siparişi onaya gönder.
4. Üretici hesabında **Gelen siparişler** bölümünden talebi onayla veya reddet. Teslim sırasında nakit alındığında üretici siparişi tamamlar.

Uygulama ilk açılışta boş katalogla başlar. Önceki prototipteki örnek ürünler, tarayıcıya kayıtlı siparişler ve demo hesaplar sunucuya aktarılmaz. Ödeme yöntemi teslimde nakittir.

## Geliştirme ve yayın

`npm run build` bağımlılık kurmadan `dist/server/index.js` oluşturur. Worker, Sites’ın sağladığı doğrulanmış kullanıcı kimliğini, D1 `DB` bağını ve R2 `BUCKET` bağını kullanır. `drizzle/0000_marketplace.sql` şemayı oluşturur. Sites üzerinden yayınlarken bu bağlantılar ve şema Sites tarafından hazırlanır.

Ürünler ve siparişler D1'de, fotoğraflar R2'de saklanır. Sepet geçici tarayıcı oturumunda tutulur. Yönetim işlemleri için kullanıcı kimliği ve ürün ya da sipariş sahipliği sunucuda doğrulanır. Sipariş onayı ve stok hareketleri veritabanında tutulur. Teslimat iletişim bilgileri yalnızca ilgili siparişin taraflarına gösterilir.
