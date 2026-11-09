ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1));
--> statement-breakpoint
DROP TRIGGER reserve_stock;
--> statement-breakpoint
CREATE TRIGGER reserve_stock AFTER INSERT ON order_items
BEGIN
  UPDATE products SET stock = stock - NEW.qty
    WHERE id = NEW.product_id AND revision = NEW.product_revision AND stock >= NEW.qty AND is_active = 1
      AND kitchen_id = (SELECT kitchen_id FROM orders WHERE id = NEW.order_id);
  SELECT CASE WHEN changes() = 0 THEN RAISE(ABORT, 'stock_or_product_changed') END;
END;
