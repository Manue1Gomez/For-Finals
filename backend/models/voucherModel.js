const { pool } = require('../config/db');
const { findMissingColumnProblems } = require('../config/schemaCheck');

const REQUIRED_COLUMNS = [
  'voucher_id',
  'voucher_code',
  'voucher_name',
  'discount_type',
  'discount_value',
  'start_date',
  'end_date',
  'usage_limit',
];

const VOUCHER_FIELDS = `voucher_id AS id,
                        voucher_code AS code,
                        voucher_name AS name,
                        discount_type AS discountType,
                        discount_value AS discountValue,
                        start_date AS startDate,
                        end_date AS endDate,
                        usage_limit AS usageLimit,
                        end_date < CURDATE() AS expired`;

async function findAll() {
  const [rows] = await pool.query(`SELECT ${VOUCHER_FIELDS} FROM voucher ORDER BY voucher_id ASC`);
  return rows;
}

async function findById(id) {
  const [[row]] = await pool.query(`SELECT ${VOUCHER_FIELDS} FROM voucher WHERE voucher_id = ?`, [id]);
  return row || null;
}

async function create({ code, name, discountType, discountValue, startDate, endDate, usageLimit }) {
  const [result] = await pool.query(
    `INSERT INTO voucher
       (voucher_code, voucher_name, discount_type, discount_value, start_date, end_date, usage_limit)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [code, name, discountType, discountValue, startDate, endDate, usageLimit]
  );
  return result.insertId;
}

async function update(id, { code, name, discountType, discountValue, startDate, endDate, usageLimit }) {
  await pool.query(
    `UPDATE voucher
        SET voucher_code = ?, voucher_name = ?, discount_type = ?, discount_value = ?,
            start_date = ?, end_date = ?, usage_limit = ?
      WHERE voucher_id = ?`,
    [code, name, discountType, discountValue, startDate, endDate, usageLimit, id]
  );
}

async function remove(id) {
  await pool.query('DELETE FROM voucher WHERE voucher_id = ?', [id]);
}

async function countBookingsUsing(code) {
  const [[row]] = await pool.query('SELECT COUNT(*) AS total FROM booking WHERE voucher_code = ?', [code]);
  return row.total;
}

async function verifySchema() {
  const { problems } = await findMissingColumnProblems('voucher', REQUIRED_COLUMNS);

  if (problems.length > 0) problems.push('Run database/voucher_table.sql in phpMyAdmin to fix this.');
  return problems;
}

module.exports = { findAll, findById, create, update, remove, countBookingsUsing, verifySchema };
