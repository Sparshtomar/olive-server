CREATE TYPE "public"."activity_level" AS ENUM('sedentary', 'light', 'moderate', 'active', 'very_active');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."goal_type" AS ENUM('lose', 'maintain', 'gain');--> statement-breakpoint
CREATE TYPE "public"."marker_status" AS ENUM('low', 'normal', 'high');--> statement-breakpoint
CREATE TYPE "public"."meal_slot" AS ENUM('breakfast', 'lunch', 'snack', 'dinner');--> statement-breakpoint
CREATE TYPE "public"."meal_source" AS ENUM('photo', 'voice', 'text');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('female', 'male');--> statement-breakpoint
CREATE TABLE "meal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"portion" text NOT NULL,
	"grams" double precision NOT NULL,
	"quantity" double precision NOT NULL,
	"calories" double precision NOT NULL,
	"protein" double precision NOT NULL,
	"carbs" double precision NOT NULL,
	"fat" double precision NOT NULL,
	"fiber" double precision NOT NULL,
	"sugar" double precision NOT NULL,
	"saturated_fat" double precision NOT NULL,
	"sodium_mg" double precision NOT NULL,
	"confidence" "confidence" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_photos" (
	"meal_id" uuid PRIMARY KEY NOT NULL,
	"mime_type" text NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"date" date NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"source" "meal_source" NOT NULL,
	"title" text NOT NULL,
	"logged_at" timestamp with time zone NOT NULL,
	"has_photo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_markers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	"ref_low" double precision,
	"ref_high" double precision,
	"marker_key" text,
	"canonical_value" double precision,
	"status" "marker_status"
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"report_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sex" "sex" NOT NULL,
	"age" integer NOT NULL,
	"height_cm" double precision NOT NULL,
	"weight_kg" double precision NOT NULL,
	"activity_level" "activity_level" NOT NULL,
	"goal_type" "goal_type" NOT NULL,
	"pace_kg_per_week" double precision NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_photos" ADD CONSTRAINT "meal_photos_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_markers" ADD CONSTRAINT "report_markers_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_items_meal_idx" ON "meal_items" USING btree ("meal_id");--> statement-breakpoint
CREATE INDEX "meals_user_date_idx" ON "meals" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "meals_user_client_id_uq" ON "meals" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "report_markers_report_idx" ON "report_markers" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "report_markers_key_idx" ON "report_markers" USING btree ("marker_key");--> statement-breakpoint
CREATE INDEX "reports_user_date_idx" ON "reports" USING btree ("user_id","report_date");