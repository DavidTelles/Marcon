ALTER TABLE requests ADD COLUMN destination_point_id varchar(64) REFERENCES plant_points(id);
--> statement-breakpoint
UPDATE requests r SET destination_point_id=wp.point_id FROM workplaces wp WHERE wp.id=r.workplace_id AND wp.point_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_requests_destination_point ON requests(destination_point_id) WHERE destination_point_id IS NOT NULL;
