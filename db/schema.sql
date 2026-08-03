-- ---------------------------------------------------------------------------
-- schema dump (partial) - crescendo academy backend
-- pulled from staging on 2026-06-30. NOT the full db, just the tables you'll
-- need for the payments + booking work. some older tables left out.
--
-- note: `trainer_id` everywhere means the instructor. we renamed "trainer" to
-- "instructor" in the UI last year but never touched the columns. don't get
-- confused by it.
-- ---------------------------------------------------------------------------

SET FOREIGN_KEY_CHECKS=0;
SET sql_mode = '';

-- students AND instructors both live here. role tells them apart.
CREATE TABLE `app_users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `role` varchar(20) DEFAULT 'student',   -- student | instructor | admin
  `timezone` varchar(64) DEFAULT NULL,    -- IANA tz, e.g. Asia/Kolkata. often empty.
  `is_guest` tinyint(1) DEFAULT 0,
  `status` tinyint(1) DEFAULT 1,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- id 1 is the built-in system/automation account. invoices created by cron or
-- by the old importer get created_by = 1.
INSERT INTO `app_users` (`id`,`name`,`email`,`role`,`timezone`,`status`) VALUES
(1,'System','system@crescendo.internal','admin',NULL,1);

CREATE TABLE `programs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) DEFAULT NULL,       -- "Piano - Grade Track", "Guitar Foundations"
  `trainer_id` int(11) DEFAULT NULL,      -- owning instructor
  `is_group` tinyint(1) DEFAULT 0,
  `status` tinyint(1) DEFAULT 1,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `program_plans` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `program_id` int(11) DEFAULT NULL,
  `name` varchar(150) DEFAULT NULL,       -- "12 Lessons", "Monthly Unlimited"
  `num_lessons` int(11) DEFAULT 0,        -- lesson credits granted
  `price` decimal(10,2) DEFAULT 0.00,
  `gst_percent` decimal(5,2) DEFAULT 18.00,
  `validity_days` int(11) DEFAULT 90,
  `status` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- a student's purchased package. this is the credit wallet a booking draws from.
-- a student can have several of these active at once (that's the mess).
CREATE TABLE `program_purchased` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `program_id` int(11) DEFAULT NULL,
  `plan_id` int(11) DEFAULT NULL,
  `trainer_id` int(11) DEFAULT NULL,
  `lessons_total` int(11) DEFAULT 0,
  `lessons_used` int(11) DEFAULT 0,
  `purchase_date` datetime DEFAULT NULL,
  `expiry_date` datetime DEFAULT NULL,
  `status` tinyint(1) DEFAULT 1,          -- 1 active, 0 expired/cancelled
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`)
  -- NOTE: no index on trainer_id even though we join/filter on it a lot
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `lesson_slots` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `trainer_id` int(11) DEFAULT NULL,
  `program_id` int(11) DEFAULT NULL,
  `start_datetime` datetime DEFAULT NULL, -- stored in server local time (IST). no tz column.
  `end_datetime` datetime DEFAULT NULL,
  `capacity` int(11) DEFAULT 1,
  `status` varchar(20) DEFAULT 'open',    -- open | full | cancelled
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `trainer_id` (`trainer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `bookings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `lesson_slot_id` int(11) DEFAULT NULL,
  `program_purchased_id` int(11) DEFAULT NULL,  -- which credit wallet this drew from
  `trainer_id` int(11) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'booked',        -- booked | cancelled | completed | no_show
  `booked_at` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `lesson_slot_id` (`lesson_slot_id`)
  -- NOTE: nothing stops the same user_id + lesson_slot_id existing twice as 'booked'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `user_invoices` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `package_id` int(11) DEFAULT NULL,      -- -> program_purchased.id
  `plan_id` int(11) DEFAULT NULL,         -- -> program_plans.id
  `trainer_id` int(11) DEFAULT NULL,      -- instructor credited for the sale. sometimes 0, sometimes NULL.
  `created_by` int(11) DEFAULT NULL,      -- staff/admin who raised it (1 = system)
  `amount` decimal(10,2) DEFAULT 0.00,    -- gross the customer was charged (incl gst)
  `gst_amount` decimal(10,2) DEFAULT 0.00,
  `convenience_fee` decimal(10,2) DEFAULT 0.00, -- gateway fee we absorb
  `discount_amount` decimal(10,2) DEFAULT 0.00,
  `payment_status` varchar(20) DEFAULT 'pending', -- pending | paid | refunded | part_refund
  `payment_date` datetime DEFAULT NULL,   -- when it actually got paid. NULL until paid.
  `created_at` datetime DEFAULT NULL,     -- when the invoice row was created
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`)
  -- NOTE: no index on package_id, plan_id, created_by
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `invoice_refunds` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `invoice_id` int(11) DEFAULT NULL,
  `refund_amount` decimal(10,2) DEFAULT 0.00,
  `is_partial` tinyint(1) DEFAULT 0,
  `reason` varchar(255) DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;  -- this one's older, never migrated to innodb

-- app settings. read by the dashboard.
CREATE TABLE `app_settings` (
  `setting_key` varchar(80) NOT NULL,
  `setting_value` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT INTO `app_settings` (`setting_key`,`setting_value`) VALUES
('gateway_convenience_pct','2.00'),
('system_user_id','1'),
('default_gst_pct','18.00');

SET FOREIGN_KEY_CHECKS=1;
