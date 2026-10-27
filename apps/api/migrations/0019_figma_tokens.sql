CREATE TABLE "figma_tokens" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"encrypted_token" text NOT NULL,
	"token_suffix" varchar(8) NOT NULL,
	"figma_handle" text NOT NULL,
	"figma_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "figma_tokens" ADD CONSTRAINT "figma_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;