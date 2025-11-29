-- ============================================
-- Dilux Database Backup - MySQL Test Database
-- ============================================

-- Create test tables with sample data for backup testing

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    stock INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Insert sample users
INSERT INTO users (username, email) VALUES
    ('john_doe', 'john@example.com'),
    ('jane_smith', 'jane@example.com'),
    ('bob_wilson', 'bob@example.com'),
    ('alice_brown', 'alice@example.com'),
    ('charlie_davis', 'charlie@example.com');

-- Insert sample products
INSERT INTO products (name, description, price, stock) VALUES
    ('Laptop Pro', 'High-performance laptop for professionals', 1299.99, 50),
    ('Wireless Mouse', 'Ergonomic wireless mouse', 49.99, 200),
    ('USB-C Hub', '7-in-1 USB-C hub with HDMI', 79.99, 150),
    ('Mechanical Keyboard', 'RGB mechanical keyboard', 129.99, 100),
    ('Monitor 27"', '4K IPS monitor', 449.99, 30),
    ('Webcam HD', '1080p webcam with microphone', 89.99, 75),
    ('Headphones', 'Noise-cancelling wireless headphones', 199.99, 60),
    ('External SSD', '1TB portable SSD', 149.99, 120);

-- Insert sample orders
INSERT INTO orders (user_id, total_amount, status) VALUES
    (1, 1349.98, 'delivered'),
    (2, 279.97, 'shipped'),
    (3, 449.99, 'processing'),
    (1, 129.99, 'pending'),
    (4, 649.97, 'delivered');

-- Insert sample order items
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
    (1, 1, 1, 1299.99),
    (1, 2, 1, 49.99),
    (2, 3, 1, 79.99),
    (2, 4, 1, 129.99),
    (2, 6, 1, 89.99),
    (3, 5, 1, 449.99),
    (4, 4, 1, 129.99),
    (5, 7, 1, 199.99),
    (5, 8, 3, 149.99);

-- Create a view for reporting
CREATE OR REPLACE VIEW order_summary AS
SELECT
    o.id AS order_id,
    u.username,
    u.email,
    o.total_amount,
    o.status,
    COUNT(oi.id) AS item_count,
    o.created_at
FROM orders o
JOIN users u ON o.user_id = u.id
JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id, u.username, u.email, o.total_amount, o.status, o.created_at;

-- Create index for better query performance
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);

SELECT 'MySQL test database initialized successfully!' AS status;
