# AuraGraph Pro 🚀
### Modern, Yüksek Performanslı Matematiksel Analiz ve Fonksiyon Görselleştirme Platformu

AuraGraph Pro, karmaşık matematiksel fonksiyonları gerçek zamanlı olarak görselleştirmek, analiz etmek ve profesyonel raporlara dönüştürmek için tasarlanmış web tabanlı bir araçtır. 


## 🌟 Öne Çıkan Özellikler

- **Çoklu Çizim Modu**: 
  - **Kartezyen**: `y = f(x)` denklemleri.
  - **Polar**: `r = f(θ)` ile geometrik sanat ve spiraller.
  - **Parametrik**: `x(t)` ve `y(t)` ile karmaşık yörüngeler.
- **Dinamik Parametre Kontrolü**: `a`, `b` ve `c` sürgüleri ile denklemleri anlık olarak manipüle edin.
- **Akıllı Matematik Analizi**:
  - Otomatik Kök tespiti.
  - Yerel Maksimum ve Minimum noktalarının otomatik işaretlenmesi.
  - Sembolik türev hesaplama ve görüntüleme.
  - İntegral alanı görselleştirme ve renklendirme.
- **İleri Seviye Görselleştirme**:
  - **Akıllı Takip (Tracing)**: Fare imleci ile eğri üzerinde hassas koordinat takibi.
  - **Dinamik Ölçekleme**: Zoom seviyesine göre boyutu ayarlanan akıllı işaretçiler.
  - **Karanlık/Aydınlık Mod**: Göz yorgunluğunu azaltan modern temalar.
- **Profesyonel Dokumentasyon**:
  - Yüksek çözünürlüklü (HD) filigranlı görsel çıktısı.

## 🛠️ Teknik Altyapı

- **Motor**: [Math.js](https://mathjs.org/) (Sembolik ve Nümerik hesaplama).
- **Rendering**: HTML5 Canvas (Hızlı ve pürüzsüz grafik çizimi).
- **İkonlar**: [Lucide Icons](https://lucide.dev/).
- **Tasarım**: Saf CSS (Glassmorphism & Modern UI).

## 🌍 Canlı Demo

Uygulamaya hiç kurulum yapmadan doğrudan tarayıcınız üzerinden erişebilirsiniz:
**👉 [AuraGraph Pro Canlı İzle](https://midvella.github.io/auragraph-pro/)**

## 🚀 Kurulum ve Yerel Çalıştırma

Projeyi kendi bilgisayarınızda çalıştırmak için iki seçeneğiniz var:

### 1. Klasik Yöntem (İndir ve Aç)
- Projeyi ZIP olarak indirin ve zipten çıkarın.
- `index.html` dosyasına çift tıklayarak herhangi bir modern tarayıcıda çalıştırın.

### 2. Git ile Klonlama
```bash
# Projeyi klonlayın
git clone https://github.com/midvella/auragraph-pro.git

# Dizine girin
cd auragraph-pro

# index.html dosyasını tarayıcıda açın
```

## ⌨️ Klavye Kısayolları

| Tuş | Fonksiyon |
|-----|-----------|
| `+` / `=` | Yakınlaştır (Zoom In) |
| `-` | Uzaklaştır (Zoom Out) |
| `R` | Görünümü Sıfırla (Reset) |
| `Ok Tuşları` | Grafiği Kaydır (Pan) |
| `Esc` | Seçimi Temizle |

## 📄 Lisans

Bu proje **MIT Lisansı** altında lisanslanmıştır. Daha fazla bilgi için [LICENSE](LICENSE) dosyasına bakabilirsiniz.

---
*Gelistiren: midvella*

## Akıllı kadraj ve akıcı çizim

- Otomatik kadraj, Kartezyen modda seçili X aralığını koruyarak görünür fonksiyonlara göre Y aralığını büyütür veya küçültür. Polar ve parametrik modlarda iki eksen birlikte sığdırılır; geometrik oran korunur.
- Tekerlek imlecin bulunduğu noktaya doğru yakınlaştırır. Sürükleme veya yakınlaştırma otomatik kadrajı kapatır; **F**, çift tıklama veya **Ekrana sığdır** düğmesi yeniden açar.
- X ve Y aralıkları elle girilebilir. Y aralığını elle değiştirmek serbest görünüme geçirir.
- Parametrik mod ilk iki ifadeyi sırasıyla `x(t)` ve `y(t)` olarak kullanır; örnek: `cos(t)` ve `sin(t)`. Parametre aralığı `[-10, 10]`, polar açı aralığı `[0, 4π]` olur.
- İfadeler yalnızca değişince derlenir. Çizim kareleri birleştirilir; fare takibinde önbellekteki grafik kullanılır. Örnekleme sayısı ve fonksiyon sayısı (12) sınırlıdır.
- Kökler ve kritik noktalar seçili eğri için görünür X aralığında sayısal tahminlerdir. Çok dar veya hızlı salınan detaylar atlanabilir. Asimptotların kadrajı aşırı büyütmesini azaltmak için uç değerler sınırlandırılır.
- Telefonlarda grafik üstte, kaydırılabilir kontroller altta gösterilir. PNG çıktısı ekran piksel yoğunluğunda, en fazla 2× çözünürlükte üretilir.

Kadraj regresyon testleri (Node.js):

```bash
node --test tests/viewport.test.cjs
```
