CREATE TABLE kitchens (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 65),
  pickup_note TEXT NOT NULL CHECK (length(pickup_note) BETWEEN 1 AND 240)
);
--> statement-breakpoint
CREATE TABLE products (
  id TEXT PRIMARY KEY NOT NULL,
  kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 100 AND 10000000),
  stock REAL NOT NULL CHECK (stock >= 0 AND (stock * 2) = CAST(stock * 2 AS INTEGER)),
  unit TEXT NOT NULL,
  details TEXT NOT NULL,
  district TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  photo_key TEXT,
  revision TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX products_kitchen ON products(kitchen_id);
--> statement-breakpoint
CREATE TABLE orders (
  id TEXT PRIMARY KEY NOT NULL,
  kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  contact TEXT NOT NULL,
  delivery_date TEXT NOT NULL,
  delivery_slot TEXT NOT NULL,
  handoff TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Onay bekliyor' CHECK (status IN ('Onay bekliyor','Onaylandı','Hazırlanıyor','Teslime hazır','Tamamlandı','İptal','Reddedildi')),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX orders_customer ON orders(customer_id, created_at);
--> statement-breakpoint
CREATE INDEX orders_kitchen ON orders(kitchen_id, status, created_at);
--> statement-breakpoint
CREATE TABLE order_items (
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  product_revision TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  qty REAL NOT NULL CHECK (qty > 0 AND (qty * 2) = CAST(qty * 2 AS INTEGER)),
  PRIMARY KEY (order_id, product_id)
);
--> statement-breakpoint
CREATE INDEX order_items_product ON order_items(product_id);
--> statement-breakpoint
CREATE TRIGGER reserve_stock AFTER INSERT ON order_items
BEGIN
  UPDATE products SET stock = stock - NEW.qty
    WHERE id = NEW.product_id AND revision = NEW.product_revision AND stock >= NEW.qty
      AND kitchen_id = (SELECT kitchen_id FROM orders WHERE id = NEW.order_id);
  SELECT CASE WHEN changes() = 0 THEN RAISE(ABORT, 'stock_or_product_changed') END;
END;
--> statement-breakpoint
CREATE TRIGGER restore_stock AFTER UPDATE OF status ON orders
WHEN OLD.status = 'Onay bekliyor' AND NEW.status IN ('İptal','Reddedildi')
BEGIN
  UPDATE products SET stock = stock + (
    SELECT qty FROM order_items WHERE order_id = NEW.id AND product_id = products.id
  ) WHERE id IN (SELECT product_id FROM order_items WHERE order_id = NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER lock_reserved_unit BEFORE UPDATE OF unit ON products
WHEN OLD.unit <> NEW.unit AND EXISTS (
  SELECT 1 FROM order_items i JOIN orders o ON o.id = i.order_id
  WHERE i.product_id = OLD.id AND o.status = 'Onay bekliyor'
)
BEGIN
  SELECT RAISE(ABORT, 'reserved_unit');
END;
--> statement-breakpoint
CREATE TABLE checkouts (
  id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
