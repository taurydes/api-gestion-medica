import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1790384118206 implements MigrationInterface {
    name = 'InitialSchema1790384118206'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Baseline of the schema previously created by synchronize(); schemas and uuid extension go first.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        for (const schema of ['seguridad', 'parametro', 'selfManagement', 'auditoria']) {
            await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
        }
        await queryRunner.query(`CREATE TABLE "seguridad"."menu" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(150) NOT NULL, "slug" character varying(150), "menu_id" uuid, "url" character varying(100), "icono" character varying(50), "orden" smallint NOT NULL DEFAULT '0', "es_titulo" boolean NOT NULL DEFAULT false, "es_visible" boolean NOT NULL DEFAULT false, "status" boolean NOT NULL DEFAULT true, "user_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, "can" character varying(255), CONSTRAINT "menu_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "seguridad"."permisos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(255) NOT NULL, "nombre_mostrar" character varying(255) NOT NULL, "user_id" uuid NOT NULL, "activo" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, "orden" integer, "requerido" boolean NOT NULL DEFAULT false, "tipo_control" character varying(255), CONSTRAINT "PK_permisos" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "seguridad"."permisos_menus" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "permiso_id" uuid NOT NULL, "menu_id" uuid NOT NULL, "rol_id" uuid NOT NULL, "user_id" uuid NOT NULL, "activo" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, "tamanio_campo" integer, CONSTRAINT "PK_a5e32ca2fd6f6257dbba3dfcd22" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "parametro"."documento_identidad" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "letra" character varying(255), "descripcion" character varying(255) NOT NULL, "estatus" boolean NOT NULL DEFAULT true, "user_id" uuid NOT NULL, "created_at" TIMESTAMP DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, CONSTRAINT "UQ_63408303fe4ebb5cdae69b0b719" UNIQUE ("letra"), CONSTRAINT "documento_identidad_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "common_person_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "common_person_id" uuid NOT NULL, "uploaded_by" uuid, "original_name" character varying(255) NOT NULL, "stored_name" character varying(255) NOT NULL, "mime_type" character varying(100) NOT NULL, "file_size" bigint NOT NULL, "file_path" character varying(500) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_89f59bae0e9e7fdc904b38b7e1c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "persona_comun" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "letra" character varying(1), "documento" character varying(30), "primernombre" character varying(30) NOT NULL, "segundonombre" character varying(30), "primerapellido" character varying(30) NOT NULL, "segundoapellido" character varying(30), "telefono" character varying(20), "estatus" boolean NOT NULL DEFAULT true, "user_id" uuid, "created_at" TIMESTAMP DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, "photo_url" character varying(500), CONSTRAINT "UQ_64ad633807ee33a92952c382bc5" UNIQUE ("user_id"), CONSTRAINT "persona_comun_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "email" character varying(255) NOT NULL, "email_verified_at" TIMESTAMP DEFAULT now(), "password" character varying(255) NOT NULL, "status" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP, "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, "role_id" uuid NOT NULL, "first_login" boolean NOT NULL DEFAULT true, "common_person_id" uuid, CONSTRAINT "UQ_51b8b26ac168fbe7d6f5653e6cf" UNIQUE ("name"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_e356baae93eb514f72144e6fc42" UNIQUE ("common_person_id"), CONSTRAINT "users_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "seguridad"."roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(255) NOT NULL, "user_id" uuid NOT NULL, "activo" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, CONSTRAINT "roles_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "seguridad"."users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "email" character varying(255) NOT NULL, "email_verified_at" TIMESTAMP DEFAULT now(), "password" character varying(255) NOT NULL, "status" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP, "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, "role_id" uuid NOT NULL, "first_login" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_51b8b26ac168fbe7d6f5653e6cf" UNIQUE ("name"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "users_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "parametro"."allergies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "description" text, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_991993cf56ba0ec861aaf515da8" UNIQUE ("name"), CONSTRAINT "allergies_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "parametro"."chronic_diseases" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "description" text, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_c7b3d5bccfbaef58f86662ef568" UNIQUE ("name"), CONSTRAINT "chronic_diseases_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "parametro"."medications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "description" text, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_4c71a8a6de0a811702d1ef8d73f" UNIQUE ("name"), CONSTRAINT "medications_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "patients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "common_person_id" uuid NOT NULL, "patient_code" character varying(20) NOT NULL, "marital_status" character varying(20), "occupation" character varying(100), "emergency_contact_name" character varying(100), "emergency_contact_phone" character varying(20), "emergency_contact_relationship" character varying(50), "blood_type" character varying(5), "insurance_company" character varying(100), "insurance_policy_number" character varying(50), "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" uuid, "updated_by" uuid, CONSTRAINT "UQ_f34e740f037fa739f119134c565" UNIQUE ("common_person_id"), CONSTRAINT "UQ_72398f0b54d401540321d5db8bf" UNIQUE ("patient_code"), CONSTRAINT "patients_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "doctor_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "doctor_id" uuid NOT NULL, "uploaded_by" uuid, "original_name" character varying(255) NOT NULL, "stored_name" character varying(255) NOT NULL, "mime_type" character varying(100) NOT NULL, "file_size" bigint NOT NULL, "file_path" character varying(500) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_89a7e1808d5a8e20af24667bf5b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "parametro"."specialties" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "description" text, "code" character varying(20), "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_565f38f8b0417c7dbd40e429782" UNIQUE ("name"), CONSTRAINT "specialties_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "parametro"."departments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(150) NOT NULL, "description" text, "medical_center_id" uuid NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" uuid, "updated_by" uuid, CONSTRAINT "departments_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "parametro"."estado" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "descripcion" character varying(255), "iso" character varying(255), "path" text, "estatus" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, CONSTRAINT "estado_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "parametro"."municipio" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "estado_id" uuid NOT NULL, "descripcion" character varying(255) NOT NULL, "estatus" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, CONSTRAINT "municipio_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "parametro"."parroquia" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "municipio_id" uuid NOT NULL, "descripcion" character varying(255) NOT NULL, "estatus" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, CONSTRAINT "parroquia_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "parametro"."medical_center_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "medical_center_id" uuid NOT NULL, "uploaded_by" uuid, "original_name" character varying(255) NOT NULL, "stored_name" character varying(255) NOT NULL, "mime_type" character varying(100) NOT NULL, "file_size" bigint NOT NULL, "file_path" character varying(500) NOT NULL, "image_type" character varying(50) NOT NULL DEFAULT 'general', "description" text, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_adeaa4587a47cae5dc1bea3890c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "parametro"."medical_centers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "address" text, "phone" character varying(50), "email" character varying(255), "isActive" boolean NOT NULL DEFAULT true, "parroquia_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "image_url" character varying(500), "num_beds" integer NOT NULL DEFAULT '0', "num_operating_rooms" integer NOT NULL DEFAULT '0', "has_emergency" boolean NOT NULL DEFAULT false, "has_hospitalization" boolean NOT NULL DEFAULT false, "has_intensive_care" boolean NOT NULL DEFAULT false, "has_parking" boolean NOT NULL DEFAULT false, "has_pharmacy" boolean NOT NULL DEFAULT false, "has_laboratory" boolean NOT NULL DEFAULT false, CONSTRAINT "medical_centers_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "doctors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "common_person_id" uuid NOT NULL, "license_number" character varying(100) NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_16d3ee4c62bb957e17d70412632" UNIQUE ("license_number"), CONSTRAINT "UQ_f945d90c9921acd707a9fdfab0d" UNIQUE ("common_person_id"), CONSTRAINT "doctors_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "medical_histories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "patient_id" uuid NOT NULL, "doctor_id" uuid NOT NULL, "medical_center_id" uuid, "specialty_id" uuid, "consultation_date" TIMESTAMP NOT NULL, "consultation_number" character varying(50) NOT NULL, "reason_for_visit" text NOT NULL, "symptoms" text, "physical_examination" text, "blood_pressure" character varying(20), "heart_rate" integer, "temperature" numeric(4,1), "weight" numeric(5,2), "height" numeric(5,2), "respiratory_rate" integer, "oxygen_saturation" numeric(5,2), "diagnosis" text, "diagnosis_code" character varying(20), "treatment_plan" text, "observations" text, "follow_up_date" date, "follow_up_notes" text, "status" character varying(20) NOT NULL DEFAULT 'in_progress', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" uuid, "updated_by" uuid, "medical_appointment_id" uuid, CONSTRAINT "UQ_5a0ae5af5f6f0ae2cca29283045" UNIQUE ("consultation_number"), CONSTRAINT "UQ_bae767a5679d5c5a5b6b35441cd" UNIQUE ("medical_appointment_id"), CONSTRAINT "medical_histories_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "recipe_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "recipe_id" uuid NOT NULL, "medication_id" uuid, "medication_name" character varying(255) NOT NULL, "presentation" character varying(100), "concentration" character varying(50), "quantity" integer NOT NULL, "unit" character varying(20), "dosage" character varying(100) NOT NULL, "frequency" character varying(100) NOT NULL, "duration" character varying(100), "route" character varying(50), "instructions" text, "order_number" integer NOT NULL DEFAULT '1', CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "recipes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "medical_history_id" uuid NOT NULL, "patient_id" uuid NOT NULL, "doctor_id" uuid NOT NULL, "recipe_number" character varying(50) NOT NULL, "issue_date" TIMESTAMP NOT NULL, "expiry_date" date, "diagnosis" text, "general_instructions" text, "notes" text, "status" character varying(20) NOT NULL DEFAULT 'active', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" uuid, "updated_by" uuid, "medical_appointment_id" uuid, CONSTRAINT "UQ_8df89d6b5cab7824b04eabb4254" UNIQUE ("recipe_number"), CONSTRAINT "recipes_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "parametro"."genero" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "descripcion" character varying(255), "estatus" boolean NOT NULL DEFAULT true, "user_id" uuid NOT NULL, "sigla" character varying(1), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, CONSTRAINT "genero_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "parametro"."estado_civil" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "descripcion" character varying(255), "estatus" boolean NOT NULL DEFAULT true, "user_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, CONSTRAINT "estado_civil_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "appointment_files" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "appointment_id" uuid NOT NULL, "medical_history_id" uuid, "patient_id" uuid NOT NULL, "uploaded_by" uuid, "original_name" character varying(255) NOT NULL, "stored_name" character varying(255) NOT NULL, "mime_type" character varying(100) NOT NULL, "file_size" bigint NOT NULL, "file_path" character varying(500) NOT NULL, "file_type" character varying(50) NOT NULL DEFAULT 'other', "description" text, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_6af5973f7568f58c34f6c659859" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "medical_appointments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "appointment_number" character varying(50) NOT NULL, "appointment_date" TIMESTAMP NOT NULL, "duration_minutes" integer NOT NULL DEFAULT '30', "status" character varying(20) NOT NULL DEFAULT 'pending', "type" character varying(20) NOT NULL DEFAULT 'first_visit', "reason" text NOT NULL, "observations" text, "cancellation_reason" text, "patient_id" uuid NOT NULL, "doctor_id" uuid NOT NULL, "specialty_id" uuid, "medical_center_id" uuid, "department_id" uuid, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "created_by" uuid, "updated_by" uuid, CONSTRAINT "UQ_533d730a47bad2478389622fab3" UNIQUE ("appointment_number"), CONSTRAINT "medical_appointments_pkey" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "mammography_analyses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "appointment_id" uuid, "appointment_file_id" uuid, "patient_id" uuid, "analyzed_by" uuid, "prediction" character varying(20) NOT NULL, "probability" numeric(5,2) NOT NULL, "status" character varying(20) NOT NULL, "label" character varying(255), "raw_response" jsonb, "image_path" character varying(500), "image_mime_type" character varying(100), "source_file_name" character varying(255), "is_reviewed" boolean NOT NULL DEFAULT false, "reviewed_by" uuid, "reviewed_at" TIMESTAMP, "review_notes" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_e2cbf74271a0da90dded3042e8e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_mammography_analyses_appointment" ON "mammography_analyses" ("appointment_id") `);
        await queryRunner.query(`CREATE INDEX "idx_mammography_analyses_created_at" ON "mammography_analyses" ("created_at") `);
        await queryRunner.query(`CREATE TABLE "auditoria"."error_log" ("id" SERIAL NOT NULL, "occurred_at" TIMESTAMP NOT NULL DEFAULT now(), "exception_type" character varying(200) NOT NULL, "message" text, "stack_trace" text, "status_code" integer, "route" character varying(300), "http_method" character varying(10), "user_id" uuid, "correlation_id" uuid, "host" character varying(150), "app_version" character varying(50), "headers" jsonb, "request_query" jsonb, "request_body" jsonb, "context" jsonb, "tags" text array, "handled" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_0284e7aa7afe77ea1ce1621c252" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f81ad3ed2ed0cab5970df8c0c2" ON "auditoria"."error_log" ("exception_type") `);
        await queryRunner.query(`CREATE INDEX "IDX_a99b487d656302458ba73772fb" ON "auditoria"."error_log" ("route") `);
        await queryRunner.query(`CREATE INDEX "IDX_7b305586298bca047e87191655" ON "auditoria"."error_log" ("user_id") `);
        await queryRunner.query(`CREATE TABLE "parametro"."video_publicidad" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying NOT NULL, "descripcion" text, "archivo_ruta" character varying(500) NOT NULL, "duracion" integer NOT NULL, "tamano" integer, "estatus" boolean NOT NULL DEFAULT true, "cliente_id" uuid NOT NULL, "empresa_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP, "deleted_at" TIMESTAMP, CONSTRAINT "PK_e73e8fc75499aa1448c8bc71315" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "doctor_schedules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "doctor_id" uuid NOT NULL, "medical_center_id" uuid NOT NULL, "day_of_week" smallint NOT NULL, "start_time" TIME NOT NULL, "end_time" TIME NOT NULL, "slot_duration_minutes" integer NOT NULL DEFAULT '30', "max_patients_per_slot" integer NOT NULL DEFAULT '1', "max_daily_appointments" integer NOT NULL DEFAULT '20', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_a1cab57bc0a680b50d06930b377" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "patient_allergies" ("patient_id" uuid NOT NULL, "allergy_id" uuid NOT NULL, CONSTRAINT "PK_30de1b175d4dabc642f194cc7d6" PRIMARY KEY ("patient_id", "allergy_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2e8cd29a6e8b7c811beabcbf18" ON "patient_allergies" ("patient_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_15489276eac0758c0614b3595a" ON "patient_allergies" ("allergy_id") `);
        await queryRunner.query(`CREATE TABLE "patient_chronic_diseases" ("patient_id" uuid NOT NULL, "disease_id" uuid NOT NULL, CONSTRAINT "PK_aef5975c515aca17953a7cd288a" PRIMARY KEY ("patient_id", "disease_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0634351c637fe2250b093c87c6" ON "patient_chronic_diseases" ("patient_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_c6a21f1a677144230226075e1c" ON "patient_chronic_diseases" ("disease_id") `);
        await queryRunner.query(`CREATE TABLE "patient_medications" ("patient_id" uuid NOT NULL, "medication_id" uuid NOT NULL, CONSTRAINT "PK_cfb07a95af960652e33e460b389" PRIMARY KEY ("patient_id", "medication_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c8af234be84925fb65345f93af" ON "patient_medications" ("patient_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_e103aec795e631c78a18d7cb43" ON "patient_medications" ("medication_id") `);
        await queryRunner.query(`CREATE TABLE "parametro"."department_specialties" ("department_id" uuid NOT NULL, "specialty_id" uuid NOT NULL, CONSTRAINT "PK_37f635eee7daeb4a9fc0dfb285b" PRIMARY KEY ("department_id", "specialty_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_67d7dca9d50634c4de26f4afca" ON "parametro"."department_specialties" ("department_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_670b39c0f56a9e213438acaa0d" ON "parametro"."department_specialties" ("specialty_id") `);
        await queryRunner.query(`CREATE TABLE "medical_centers_doctors" ("doctor_id" uuid NOT NULL, "medical_center_id" uuid NOT NULL, CONSTRAINT "PK_55167bccd12b1060b9fe513d7c1" PRIMARY KEY ("doctor_id", "medical_center_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_89902add2a995228a59a3018fc" ON "medical_centers_doctors" ("doctor_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_e1ef2d1db02c20b43407e198e6" ON "medical_centers_doctors" ("medical_center_id") `);
        await queryRunner.query(`CREATE TABLE "doctors_specialties" ("doctor_id" uuid NOT NULL, "specialty_id" uuid NOT NULL, CONSTRAINT "PK_514e882f795cf2f53f7fc0d04b5" PRIMARY KEY ("doctor_id", "specialty_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a360223f76bef5c9f7f0c95e57" ON "doctors_specialties" ("doctor_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_b020bf9b2e794d5c5260deff45" ON "doctors_specialties" ("specialty_id") `);
        await queryRunner.query(`CREATE TABLE "departments_doctors" ("doctor_id" uuid NOT NULL, "department_id" uuid NOT NULL, CONSTRAINT "PK_d5a079741fd2236fd71385e9996" PRIMARY KEY ("doctor_id", "department_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_239859b9f057a5067b657549dd" ON "departments_doctors" ("doctor_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_d93bbafa2dc0a21daf15ae7e59" ON "departments_doctors" ("department_id") `);
        await queryRunner.query(`ALTER TABLE "seguridad"."menu" ADD CONSTRAINT "FK_237a0fe43278378e9c5729d17af" FOREIGN KEY ("menu_id") REFERENCES "seguridad"."menu"("id") ON DELETE NO ACTION ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "seguridad"."permisos_menus" ADD CONSTRAINT "FK_4ac87bf482cafc627b714e07649" FOREIGN KEY ("permiso_id") REFERENCES "seguridad"."permisos"("id") ON DELETE NO ACTION ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "seguridad"."permisos_menus" ADD CONSTRAINT "FK_bae58c52fae4911ed400b5aefdd" FOREIGN KEY ("menu_id") REFERENCES "seguridad"."menu"("id") ON DELETE NO ACTION ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "seguridad"."permisos_menus" ADD CONSTRAINT "FK_ab06c7899ee14e894fa514fc466" FOREIGN KEY ("rol_id") REFERENCES "seguridad"."roles"("id") ON DELETE NO ACTION ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "common_person_images" ADD CONSTRAINT "FK_c580d2858413565d03bfab992c6" FOREIGN KEY ("common_person_id") REFERENCES "persona_comun"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "persona_comun" ADD CONSTRAINT "FK_64ad633807ee33a92952c382bc5" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "persona_comun" ADD CONSTRAINT "FK_36c82d0fe987a497a64b1c496e1" FOREIGN KEY ("letra") REFERENCES "parametro"."documento_identidad"("letra") ON DELETE NO ACTION ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "seguridad"."roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_e356baae93eb514f72144e6fc42" FOREIGN KEY ("common_person_id") REFERENCES "persona_comun"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "seguridad"."users" ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "seguridad"."roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "patients" ADD CONSTRAINT "FK_f34e740f037fa739f119134c565" FOREIGN KEY ("common_person_id") REFERENCES "persona_comun"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "doctor_images" ADD CONSTRAINT "FK_b01866d1642d210071be6283407" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "parametro"."departments" ADD CONSTRAINT "FK_a5af61a458867ab60eaccda58cf" FOREIGN KEY ("medical_center_id") REFERENCES "parametro"."medical_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "parametro"."municipio" ADD CONSTRAINT "FK_7b77bd25279c4d20e07c1f4298a" FOREIGN KEY ("estado_id") REFERENCES "parametro"."estado"("id") ON DELETE NO ACTION ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "parametro"."parroquia" ADD CONSTRAINT "FK_8d5cf90de7a5e3251136ff523e8" FOREIGN KEY ("municipio_id") REFERENCES "parametro"."municipio"("id") ON DELETE NO ACTION ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "parametro"."medical_center_images" ADD CONSTRAINT "FK_e8c52a7b9e30985df1e0844c490" FOREIGN KEY ("medical_center_id") REFERENCES "parametro"."medical_centers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "parametro"."medical_centers" ADD CONSTRAINT "FK_fbe2abd9fc070bc8d05e543a45b" FOREIGN KEY ("parroquia_id") REFERENCES "parametro"."parroquia"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "doctors" ADD CONSTRAINT "FK_f945d90c9921acd707a9fdfab0d" FOREIGN KEY ("common_person_id") REFERENCES "persona_comun"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_histories" ADD CONSTRAINT "FK_346f79a689d013533a8b6f1c7dd" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_histories" ADD CONSTRAINT "FK_499c19b31792aaab9186e8b0768" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_histories" ADD CONSTRAINT "FK_02d88bb718edb3c0d86642d8824" FOREIGN KEY ("medical_center_id") REFERENCES "parametro"."medical_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_histories" ADD CONSTRAINT "FK_3b2a0d103da5b654bf12cf6b305" FOREIGN KEY ("specialty_id") REFERENCES "parametro"."specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_histories" ADD CONSTRAINT "FK_bae767a5679d5c5a5b6b35441cd" FOREIGN KEY ("medical_appointment_id") REFERENCES "medical_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "recipe_items" ADD CONSTRAINT "FK_2de4c7251ed3dd16f2f96ce45ed" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "recipe_items" ADD CONSTRAINT "FK_8317583610611d4a155b08b878f" FOREIGN KEY ("medication_id") REFERENCES "parametro"."medications"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "recipes" ADD CONSTRAINT "FK_fb6c06d2cd4dd750a9009242b72" FOREIGN KEY ("medical_history_id") REFERENCES "medical_histories"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "recipes" ADD CONSTRAINT "FK_68eaed508c72b3758b20c20db08" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "recipes" ADD CONSTRAINT "FK_c7db2b2ac918f45128f98cb3a30" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "recipes" ADD CONSTRAINT "FK_007a0a7317f76f82dd52cca1e65" FOREIGN KEY ("medical_appointment_id") REFERENCES "medical_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "appointment_files" ADD CONSTRAINT "FK_6f41e785fb4b4d0b812c929649f" FOREIGN KEY ("appointment_id") REFERENCES "medical_appointments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" ADD CONSTRAINT "FK_23c3009b42b8d791afa709ad351" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" ADD CONSTRAINT "FK_b606c06ec0015cfc8da3427e225" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" ADD CONSTRAINT "FK_35ea7e4fd3633e04a134ed5c1cf" FOREIGN KEY ("specialty_id") REFERENCES "parametro"."specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" ADD CONSTRAINT "FK_e17ba33b8cd632930a24a6f3e58" FOREIGN KEY ("medical_center_id") REFERENCES "parametro"."medical_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" ADD CONSTRAINT "FK_57001c3d79090c9e979ad3dc92f" FOREIGN KEY ("department_id") REFERENCES "parametro"."departments"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" ADD CONSTRAINT "FK_376cf3acae331eb350fa7fc3105" FOREIGN KEY ("appointment_id") REFERENCES "medical_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" ADD CONSTRAINT "FK_9d2be64a9a4fbcada69f7553798" FOREIGN KEY ("appointment_file_id") REFERENCES "appointment_files"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" ADD CONSTRAINT "FK_e1dab06ede7650fdd9b568beb22" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" ADD CONSTRAINT "FK_f2b63e5b97cf67f212236d280b2" FOREIGN KEY ("analyzed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "doctor_schedules" ADD CONSTRAINT "FK_a9562c0e3b99e62425d3356c88b" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "doctor_schedules" ADD CONSTRAINT "FK_4de7c46674715fd710bcb0ee517" FOREIGN KEY ("medical_center_id") REFERENCES "parametro"."medical_centers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "patient_allergies" ADD CONSTRAINT "FK_2e8cd29a6e8b7c811beabcbf18d" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "patient_allergies" ADD CONSTRAINT "FK_15489276eac0758c0614b3595a2" FOREIGN KEY ("allergy_id") REFERENCES "parametro"."allergies"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "patient_chronic_diseases" ADD CONSTRAINT "FK_0634351c637fe2250b093c87c66" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "patient_chronic_diseases" ADD CONSTRAINT "FK_c6a21f1a677144230226075e1cd" FOREIGN KEY ("disease_id") REFERENCES "parametro"."chronic_diseases"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "patient_medications" ADD CONSTRAINT "FK_c8af234be84925fb65345f93afa" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "patient_medications" ADD CONSTRAINT "FK_e103aec795e631c78a18d7cb43b" FOREIGN KEY ("medication_id") REFERENCES "parametro"."medications"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "parametro"."department_specialties" ADD CONSTRAINT "FK_67d7dca9d50634c4de26f4afca3" FOREIGN KEY ("department_id") REFERENCES "parametro"."departments"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "parametro"."department_specialties" ADD CONSTRAINT "FK_670b39c0f56a9e213438acaa0d4" FOREIGN KEY ("specialty_id") REFERENCES "parametro"."specialties"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "medical_centers_doctors" ADD CONSTRAINT "FK_89902add2a995228a59a3018fca" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_centers_doctors" ADD CONSTRAINT "FK_e1ef2d1db02c20b43407e198e6a" FOREIGN KEY ("medical_center_id") REFERENCES "parametro"."medical_centers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "doctors_specialties" ADD CONSTRAINT "FK_a360223f76bef5c9f7f0c95e57d" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "doctors_specialties" ADD CONSTRAINT "FK_b020bf9b2e794d5c5260deff452" FOREIGN KEY ("specialty_id") REFERENCES "parametro"."specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "departments_doctors" ADD CONSTRAINT "FK_239859b9f057a5067b657549dd1" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "departments_doctors" ADD CONSTRAINT "FK_d93bbafa2dc0a21daf15ae7e593" FOREIGN KEY ("department_id") REFERENCES "parametro"."departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        // Helper function created by hand on the original database; kept so a fresh schema matches it.
        await queryRunner.query(`CREATE OR REPLACE FUNCTION seguridad.asignar_super_permisos(p_role_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_role_id UUID;
    v_user_id UUID;
    v_count INTEGER := 0;
BEGIN
    -- 1. Determinar el rol y el usuario
    IF p_user_id IS NOT NULL THEN
        SELECT role_id, id INTO v_role_id, v_user_id 
        FROM seguridad.users 
        WHERE id = p_user_id;
        
        IF v_role_id IS NULL THEN
            RETURN 'Error: Usuario no encontrado o no tiene rol asignado.';
        END IF;
    ELSE
        v_role_id := p_role_id;
        -- Usar un UUID nulo o de sistema para el user_id obligatorio
        v_user_id := '00000000-0000-0000-0000-000000000000'::UUID; 
    END IF;

    IF v_role_id IS NULL THEN
        RETURN 'Error: Debe proporcionar al menos un roleId o userId.';
    END IF;

    -- 2. Insertar omitiendo el campo 'id' (dejar que el BIGINT serial lo genere)
    INSERT INTO seguridad.permisos_menus (
        menu_id, 
        permiso_id, 
        rol_id, 
        user_id, 
        activo, 
        created_at
    )
    SELECT 
        m.id, 
        p.id, 
        v_role_id, 
        v_user_id, 
        true, 
        NOW()
    FROM seguridad.menu m
    CROSS JOIN seguridad.permisos p
    WHERE m.status = true             -- Solo menús activos
      AND p.activo = true             -- Solo permisos activos
      AND NOT EXISTS (                -- Evitar duplicados
          SELECT 1 FROM seguridad.permisos_menus pm 
          WHERE pm.menu_id = m.id 
            AND pm.permiso_id = p.id 
            AND pm.rol_id = v_role_id
            AND pm.user_id = v_user_id
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN 'Éxito: Se asignaron ' || v_count || ' combinaciones de permisos/menús.';
END;
$function$`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP FUNCTION IF EXISTS "seguridad"."asignar_super_permisos"(uuid, uuid)`);
        await queryRunner.query(`ALTER TABLE "departments_doctors" DROP CONSTRAINT "FK_d93bbafa2dc0a21daf15ae7e593"`);
        await queryRunner.query(`ALTER TABLE "departments_doctors" DROP CONSTRAINT "FK_239859b9f057a5067b657549dd1"`);
        await queryRunner.query(`ALTER TABLE "doctors_specialties" DROP CONSTRAINT "FK_b020bf9b2e794d5c5260deff452"`);
        await queryRunner.query(`ALTER TABLE "doctors_specialties" DROP CONSTRAINT "FK_a360223f76bef5c9f7f0c95e57d"`);
        await queryRunner.query(`ALTER TABLE "medical_centers_doctors" DROP CONSTRAINT "FK_e1ef2d1db02c20b43407e198e6a"`);
        await queryRunner.query(`ALTER TABLE "medical_centers_doctors" DROP CONSTRAINT "FK_89902add2a995228a59a3018fca"`);
        await queryRunner.query(`ALTER TABLE "parametro"."department_specialties" DROP CONSTRAINT "FK_670b39c0f56a9e213438acaa0d4"`);
        await queryRunner.query(`ALTER TABLE "parametro"."department_specialties" DROP CONSTRAINT "FK_67d7dca9d50634c4de26f4afca3"`);
        await queryRunner.query(`ALTER TABLE "patient_medications" DROP CONSTRAINT "FK_e103aec795e631c78a18d7cb43b"`);
        await queryRunner.query(`ALTER TABLE "patient_medications" DROP CONSTRAINT "FK_c8af234be84925fb65345f93afa"`);
        await queryRunner.query(`ALTER TABLE "patient_chronic_diseases" DROP CONSTRAINT "FK_c6a21f1a677144230226075e1cd"`);
        await queryRunner.query(`ALTER TABLE "patient_chronic_diseases" DROP CONSTRAINT "FK_0634351c637fe2250b093c87c66"`);
        await queryRunner.query(`ALTER TABLE "patient_allergies" DROP CONSTRAINT "FK_15489276eac0758c0614b3595a2"`);
        await queryRunner.query(`ALTER TABLE "patient_allergies" DROP CONSTRAINT "FK_2e8cd29a6e8b7c811beabcbf18d"`);
        await queryRunner.query(`ALTER TABLE "doctor_schedules" DROP CONSTRAINT "FK_4de7c46674715fd710bcb0ee517"`);
        await queryRunner.query(`ALTER TABLE "doctor_schedules" DROP CONSTRAINT "FK_a9562c0e3b99e62425d3356c88b"`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" DROP CONSTRAINT "FK_f2b63e5b97cf67f212236d280b2"`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" DROP CONSTRAINT "FK_e1dab06ede7650fdd9b568beb22"`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" DROP CONSTRAINT "FK_9d2be64a9a4fbcada69f7553798"`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" DROP CONSTRAINT "FK_376cf3acae331eb350fa7fc3105"`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" DROP CONSTRAINT "FK_57001c3d79090c9e979ad3dc92f"`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" DROP CONSTRAINT "FK_e17ba33b8cd632930a24a6f3e58"`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" DROP CONSTRAINT "FK_35ea7e4fd3633e04a134ed5c1cf"`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" DROP CONSTRAINT "FK_b606c06ec0015cfc8da3427e225"`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" DROP CONSTRAINT "FK_23c3009b42b8d791afa709ad351"`);
        await queryRunner.query(`ALTER TABLE "appointment_files" DROP CONSTRAINT "FK_6f41e785fb4b4d0b812c929649f"`);
        await queryRunner.query(`ALTER TABLE "recipes" DROP CONSTRAINT "FK_007a0a7317f76f82dd52cca1e65"`);
        await queryRunner.query(`ALTER TABLE "recipes" DROP CONSTRAINT "FK_c7db2b2ac918f45128f98cb3a30"`);
        await queryRunner.query(`ALTER TABLE "recipes" DROP CONSTRAINT "FK_68eaed508c72b3758b20c20db08"`);
        await queryRunner.query(`ALTER TABLE "recipes" DROP CONSTRAINT "FK_fb6c06d2cd4dd750a9009242b72"`);
        await queryRunner.query(`ALTER TABLE "recipe_items" DROP CONSTRAINT "FK_8317583610611d4a155b08b878f"`);
        await queryRunner.query(`ALTER TABLE "recipe_items" DROP CONSTRAINT "FK_2de4c7251ed3dd16f2f96ce45ed"`);
        await queryRunner.query(`ALTER TABLE "medical_histories" DROP CONSTRAINT "FK_bae767a5679d5c5a5b6b35441cd"`);
        await queryRunner.query(`ALTER TABLE "medical_histories" DROP CONSTRAINT "FK_3b2a0d103da5b654bf12cf6b305"`);
        await queryRunner.query(`ALTER TABLE "medical_histories" DROP CONSTRAINT "FK_02d88bb718edb3c0d86642d8824"`);
        await queryRunner.query(`ALTER TABLE "medical_histories" DROP CONSTRAINT "FK_499c19b31792aaab9186e8b0768"`);
        await queryRunner.query(`ALTER TABLE "medical_histories" DROP CONSTRAINT "FK_346f79a689d013533a8b6f1c7dd"`);
        await queryRunner.query(`ALTER TABLE "doctors" DROP CONSTRAINT "FK_f945d90c9921acd707a9fdfab0d"`);
        await queryRunner.query(`ALTER TABLE "parametro"."medical_centers" DROP CONSTRAINT "FK_fbe2abd9fc070bc8d05e543a45b"`);
        await queryRunner.query(`ALTER TABLE "parametro"."medical_center_images" DROP CONSTRAINT "FK_e8c52a7b9e30985df1e0844c490"`);
        await queryRunner.query(`ALTER TABLE "parametro"."parroquia" DROP CONSTRAINT "FK_8d5cf90de7a5e3251136ff523e8"`);
        await queryRunner.query(`ALTER TABLE "parametro"."municipio" DROP CONSTRAINT "FK_7b77bd25279c4d20e07c1f4298a"`);
        await queryRunner.query(`ALTER TABLE "parametro"."departments" DROP CONSTRAINT "FK_a5af61a458867ab60eaccda58cf"`);
        await queryRunner.query(`ALTER TABLE "doctor_images" DROP CONSTRAINT "FK_b01866d1642d210071be6283407"`);
        await queryRunner.query(`ALTER TABLE "patients" DROP CONSTRAINT "FK_f34e740f037fa739f119134c565"`);
        await queryRunner.query(`ALTER TABLE "seguridad"."users" DROP CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_e356baae93eb514f72144e6fc42"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1"`);
        await queryRunner.query(`ALTER TABLE "persona_comun" DROP CONSTRAINT "FK_36c82d0fe987a497a64b1c496e1"`);
        await queryRunner.query(`ALTER TABLE "persona_comun" DROP CONSTRAINT "FK_64ad633807ee33a92952c382bc5"`);
        await queryRunner.query(`ALTER TABLE "common_person_images" DROP CONSTRAINT "FK_c580d2858413565d03bfab992c6"`);
        await queryRunner.query(`ALTER TABLE "seguridad"."permisos_menus" DROP CONSTRAINT "FK_ab06c7899ee14e894fa514fc466"`);
        await queryRunner.query(`ALTER TABLE "seguridad"."permisos_menus" DROP CONSTRAINT "FK_bae58c52fae4911ed400b5aefdd"`);
        await queryRunner.query(`ALTER TABLE "seguridad"."permisos_menus" DROP CONSTRAINT "FK_4ac87bf482cafc627b714e07649"`);
        await queryRunner.query(`ALTER TABLE "seguridad"."menu" DROP CONSTRAINT "FK_237a0fe43278378e9c5729d17af"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d93bbafa2dc0a21daf15ae7e59"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_239859b9f057a5067b657549dd"`);
        await queryRunner.query(`DROP TABLE "departments_doctors"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b020bf9b2e794d5c5260deff45"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a360223f76bef5c9f7f0c95e57"`);
        await queryRunner.query(`DROP TABLE "doctors_specialties"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e1ef2d1db02c20b43407e198e6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_89902add2a995228a59a3018fc"`);
        await queryRunner.query(`DROP TABLE "medical_centers_doctors"`);
        await queryRunner.query(`DROP INDEX "parametro"."IDX_670b39c0f56a9e213438acaa0d"`);
        await queryRunner.query(`DROP INDEX "parametro"."IDX_67d7dca9d50634c4de26f4afca"`);
        await queryRunner.query(`DROP TABLE "parametro"."department_specialties"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e103aec795e631c78a18d7cb43"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c8af234be84925fb65345f93af"`);
        await queryRunner.query(`DROP TABLE "patient_medications"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c6a21f1a677144230226075e1c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0634351c637fe2250b093c87c6"`);
        await queryRunner.query(`DROP TABLE "patient_chronic_diseases"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_15489276eac0758c0614b3595a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2e8cd29a6e8b7c811beabcbf18"`);
        await queryRunner.query(`DROP TABLE "patient_allergies"`);
        await queryRunner.query(`DROP TABLE "doctor_schedules"`);
        await queryRunner.query(`DROP TABLE "parametro"."video_publicidad"`);
        await queryRunner.query(`DROP INDEX "auditoria"."IDX_7b305586298bca047e87191655"`);
        await queryRunner.query(`DROP INDEX "auditoria"."IDX_a99b487d656302458ba73772fb"`);
        await queryRunner.query(`DROP INDEX "auditoria"."IDX_f81ad3ed2ed0cab5970df8c0c2"`);
        await queryRunner.query(`DROP TABLE "auditoria"."error_log"`);
        await queryRunner.query(`DROP INDEX "public"."idx_mammography_analyses_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_mammography_analyses_appointment"`);
        await queryRunner.query(`DROP TABLE "mammography_analyses"`);
        await queryRunner.query(`DROP TABLE "medical_appointments"`);
        await queryRunner.query(`DROP TABLE "appointment_files"`);
        await queryRunner.query(`DROP TABLE "parametro"."estado_civil"`);
        await queryRunner.query(`DROP TABLE "parametro"."genero"`);
        await queryRunner.query(`DROP TABLE "recipes"`);
        await queryRunner.query(`DROP TABLE "recipe_items"`);
        await queryRunner.query(`DROP TABLE "medical_histories"`);
        await queryRunner.query(`DROP TABLE "doctors"`);
        await queryRunner.query(`DROP TABLE "parametro"."medical_centers"`);
        await queryRunner.query(`DROP TABLE "parametro"."medical_center_images"`);
        await queryRunner.query(`DROP TABLE "parametro"."parroquia"`);
        await queryRunner.query(`DROP TABLE "parametro"."municipio"`);
        await queryRunner.query(`DROP TABLE "parametro"."estado"`);
        await queryRunner.query(`DROP TABLE "parametro"."departments"`);
        await queryRunner.query(`DROP TABLE "parametro"."specialties"`);
        await queryRunner.query(`DROP TABLE "doctor_images"`);
        await queryRunner.query(`DROP TABLE "patients"`);
        await queryRunner.query(`DROP TABLE "parametro"."medications"`);
        await queryRunner.query(`DROP TABLE "parametro"."chronic_diseases"`);
        await queryRunner.query(`DROP TABLE "parametro"."allergies"`);
        await queryRunner.query(`DROP TABLE "seguridad"."users"`);
        await queryRunner.query(`DROP TABLE "seguridad"."roles"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "persona_comun"`);
        await queryRunner.query(`DROP TABLE "common_person_images"`);
        await queryRunner.query(`DROP TABLE "parametro"."documento_identidad"`);
        await queryRunner.query(`DROP TABLE "seguridad"."permisos_menus"`);
        await queryRunner.query(`DROP TABLE "seguridad"."permisos"`);
        await queryRunner.query(`DROP TABLE "seguridad"."menu"`);
    }

}
