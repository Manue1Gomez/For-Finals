CREATE TABLE IF NOT EXISTS voucher (
  voucher_id      INT           NOT NULL AUTO_INCREMENT,
  voucher_code    VARCHAR(30)   NOT NULL,
  voucher_name    VARCHAR(100)  NOT NULL,
  discount_type   ENUM('Percentage','Fixed') NOT NULL,
  discount_value  DECIMAL(10,2) NOT NULL,
  start_date      DATE          NOT NULL,
  end_date        DATE          NOT NULL,
  usage_limit     INT           NOT NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (voucher_id),
  UNIQUE KEY uq_voucher_code (voucher_code),
  CONSTRAINT chk_voucher_value CHECK (discount_value > 0),
  CONSTRAINT chk_voucher_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_voucher_limit CHECK (usage_limit > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
