# Lynk.id Testing Security

Development dan production memakai payment contract yang sama:

- harga dan currency berasal dari backend plan catalog;
- tidak ada zero-price override;
- payment intent dibuat sebelum redirect;
- provider order reference, product ID, amount, currency, dan customer harus cocok;
- webhook wajib memiliki authentication header;
- query-string secret tidak didukung;
- event ID unik mencegah replay;
- refund dan chargeback mencabut akses.

Lynk `Test URL` hanya menguji konektivitas dan tidak boleh mengaktifkan subscription.
Uji end-to-end harus memakai produk dengan nominal catalog yang sebenarnya.

Production tetap NO-GO sampai Lynk mengonfirmasi mekanisme autentikasi webhook dan
checkout nyata terbukti mengembalikan provider order reference yang dibuat Orviko.
