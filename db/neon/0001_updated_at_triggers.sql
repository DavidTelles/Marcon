CREATE OR REPLACE FUNCTION marcon_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION marcon_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER parts_touch_updated_at BEFORE UPDATE ON parts FOR EACH ROW EXECUTE FUNCTION marcon_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER inventory_touch_updated_at BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION marcon_touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER requests_touch_updated_at BEFORE UPDATE ON requests FOR EACH ROW EXECUTE FUNCTION marcon_touch_updated_at();
