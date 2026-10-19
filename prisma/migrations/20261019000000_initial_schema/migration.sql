-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "app_user" (
    "user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "role" (
    "role_id" UUID NOT NULL,
    "role_name" TEXT NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "permission" (
    "permission_id" UUID NOT NULL,
    "permission_name" TEXT NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("permission_id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "login_credential" (
    "credential_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_credential_pkey" PRIMARY KEY ("credential_id")
);

-- CreateTable
CREATE TABLE "department" (
    "department_id" UUID NOT NULL,
    "department_name" TEXT NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("department_id")
);

-- CreateTable
CREATE TABLE "hiring_level" (
    "hiring_level_id" UUID NOT NULL,
    "level_name" TEXT NOT NULL,
    "evaluation_interval_years" INTEGER NOT NULL,

    CONSTRAINT "hiring_level_pkey" PRIMARY KEY ("hiring_level_id")
);

-- CreateTable
CREATE TABLE "professor" (
    "professor_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "hiring_level_id" UUID NOT NULL,
    "hire_date" DATE,

    CONSTRAINT "professor_pkey" PRIMARY KEY ("professor_id")
);

-- CreateTable
CREATE TABLE "semester" (
    "semester_id" UUID NOT NULL,
    "term_code" TEXT NOT NULL,
    "term_name" TEXT NOT NULL,

    CONSTRAINT "semester_pkey" PRIMARY KEY ("semester_id")
);

-- CreateTable
CREATE TABLE "course" (
    "course_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "course_code" TEXT NOT NULL,
    "course_title" TEXT NOT NULL,
    "course_level" INTEGER NOT NULL,

    CONSTRAINT "course_pkey" PRIMARY KEY ("course_id")
);

-- CreateTable
CREATE TABLE "course_section" (
    "section_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "section_code" TEXT NOT NULL,

    CONSTRAINT "course_section_pkey" PRIMARY KEY ("section_id")
);

-- CreateTable
CREATE TABLE "teaches" (
    "professor_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,

    CONSTRAINT "teaches_pkey" PRIMARY KEY ("professor_id","section_id")
);

-- CreateTable
CREATE TABLE "class_meeting" (
    "meeting_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "day_of_week" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "location" TEXT,

    CONSTRAINT "class_meeting_pkey" PRIMARY KEY ("meeting_id")
);

-- CreateTable
CREATE TABLE "evaluation_cycle" (
    "cycle_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "cycle_name" TEXT NOT NULL,
    "signup_deadline" TIMESTAMP(3) NOT NULL,
    "observation_deadline" TIMESTAMP(3) NOT NULL,
    "feedback_deadline" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_cycle_pkey" PRIMARY KEY ("cycle_id")
);

-- CreateTable
CREATE TABLE "evaluation_signup" (
    "signup_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "professor_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "signup_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_signup_pkey" PRIMARY KEY ("signup_id")
);

-- CreateTable
CREATE TABLE "observation" (
    "observation_id" UUID NOT NULL,
    "signup_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "observer_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "observation_pkey" PRIMARY KEY ("observation_id")
);

-- CreateTable
CREATE TABLE "observation_candidate" (
    "candidate_id" UUID NOT NULL,
    "observation_id" UUID NOT NULL,
    "professor_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ELIGIBLE',
    "invited_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "observation_candidate_pkey" PRIMARY KEY ("candidate_id")
);

-- CreateTable
CREATE TABLE "observation_time_option" (
    "time_option_id" UUID NOT NULL,
    "observation_id" UUID NOT NULL,
    "preferred_date" DATE NOT NULL,

    CONSTRAINT "observation_time_option_pkey" PRIMARY KEY ("time_option_id")
);

-- CreateTable
CREATE TABLE "observation_template" (
    "template_id" UUID NOT NULL,
    "template_name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observation_template_pkey" PRIMARY KEY ("template_id")
);

-- CreateTable
CREATE TABLE "template_criterion" (
    "criterion_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "criterion_text" TEXT NOT NULL,
    "question_type" TEXT NOT NULL,
    "min_rating" INTEGER,
    "max_rating" INTEGER,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "template_criterion_pkey" PRIMARY KEY ("criterion_id")
);

-- CreateTable
CREATE TABLE "signed_assessment" (
    "assessment_id" UUID NOT NULL,
    "observation_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "responses" JSONB NOT NULL,
    "observer_signed_at" TIMESTAMP(3),
    "observee_signed_at" TIMESTAMP(3),
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "signed_assessment_pkey" PRIMARY KEY ("assessment_id")
);

-- CreateTable
CREATE TABLE "process_feedback" (
    "feedback_id" UUID NOT NULL,
    "observation_id" UUID NOT NULL,
    "professor_id" UUID NOT NULL,
    "feedback_role" TEXT NOT NULL,
    "satisfaction" INTEGER,
    "difficulties" TEXT,
    "suggestions" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "process_feedback_pkey" PRIMARY KEY ("feedback_id")
);

-- CreateTable
CREATE TABLE "notification" (
    "notification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "notification_type" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "notification_pkey" PRIMARY KEY ("notification_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_username_key" ON "app_user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "role_role_name_key" ON "role"("role_name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_permission_name_key" ON "permission"("permission_name");

-- CreateIndex
CREATE UNIQUE INDEX "login_credential_user_id_key" ON "login_credential"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "department_department_name_key" ON "department"("department_name");

-- CreateIndex
CREATE UNIQUE INDEX "hiring_level_level_name_key" ON "hiring_level"("level_name");

-- CreateIndex
CREATE UNIQUE INDEX "professor_user_id_key" ON "professor"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "semester_term_code_key" ON "semester"("term_code");

-- CreateIndex
CREATE UNIQUE INDEX "course_department_id_course_code_key" ON "course"("department_id", "course_code");

-- CreateIndex
CREATE UNIQUE INDEX "course_section_course_id_semester_id_section_code_key" ON "course_section"("course_id", "semester_id", "section_code");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_signup_cycle_id_professor_id_key" ON "evaluation_signup"("cycle_id", "professor_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_signup_signup_id_cycle_id_key" ON "evaluation_signup"("signup_id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "observation_candidate_observation_id_professor_id_key" ON "observation_candidate"("observation_id", "professor_id");

-- CreateIndex
CREATE UNIQUE INDEX "observation_time_option_observation_id_preferred_date_key" ON "observation_time_option"("observation_id", "preferred_date");

-- CreateIndex
CREATE UNIQUE INDEX "template_criterion_template_id_display_order_key" ON "template_criterion"("template_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "signed_assessment_observation_id_key" ON "signed_assessment"("observation_id");

-- CreateIndex
CREATE UNIQUE INDEX "process_feedback_observation_id_professor_id_feedback_role_key" ON "process_feedback"("observation_id", "professor_id", "feedback_role");

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("role_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("role_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("permission_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_credential" ADD CONSTRAINT "login_credential_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professor" ADD CONSTRAINT "professor_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professor" ADD CONSTRAINT "professor_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("department_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professor" ADD CONSTRAINT "professor_hiring_level_id_fkey" FOREIGN KEY ("hiring_level_id") REFERENCES "hiring_level"("hiring_level_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course" ADD CONSTRAINT "course_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("department_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_section" ADD CONSTRAINT "course_section_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_section" ADD CONSTRAINT "course_section_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semester"("semester_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaches" ADD CONSTRAINT "teaches_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professor"("professor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaches" ADD CONSTRAINT "teaches_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_section"("section_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_meeting" ADD CONSTRAINT "class_meeting_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_section"("section_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_cycle" ADD CONSTRAINT "evaluation_cycle_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semester"("semester_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_signup" ADD CONSTRAINT "evaluation_signup_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "evaluation_cycle"("cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_signup" ADD CONSTRAINT "evaluation_signup_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professor"("professor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_signup" ADD CONSTRAINT "evaluation_signup_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_section"("section_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation" ADD CONSTRAINT "observation_signup_id_cycle_id_fkey" FOREIGN KEY ("signup_id", "cycle_id") REFERENCES "evaluation_signup"("signup_id", "cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation" ADD CONSTRAINT "observation_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "evaluation_cycle"("cycle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation" ADD CONSTRAINT "observation_observer_id_fkey" FOREIGN KEY ("observer_id") REFERENCES "professor"("professor_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_candidate" ADD CONSTRAINT "observation_candidate_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "observation"("observation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_candidate" ADD CONSTRAINT "observation_candidate_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professor"("professor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_time_option" ADD CONSTRAINT "observation_time_option_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "observation"("observation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_criterion" ADD CONSTRAINT "template_criterion_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "observation_template"("template_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_assessment" ADD CONSTRAINT "signed_assessment_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "observation"("observation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signed_assessment" ADD CONSTRAINT "signed_assessment_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "observation_template"("template_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_feedback" ADD CONSTRAINT "process_feedback_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "observation"("observation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "process_feedback" ADD CONSTRAINT "process_feedback_professor_id_fkey" FOREIGN KEY ("professor_id") REFERENCES "professor"("professor_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
