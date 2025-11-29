-- ============================================
-- Dilux Database Backup - SQL Server Test Database
-- ============================================

-- Use the testdb database
USE testdb;
GO

-- Create test tables with sample data for backup testing

-- Users table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
BEGIN
    CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username NVARCHAR(50) NOT NULL UNIQUE,
        email NVARCHAR(100) NOT NULL,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE()
    );
END
GO

-- Products table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='products' AND xtype='U')
BEGIN
    CREATE TABLE products (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        description NVARCHAR(MAX),
        price DECIMAL(10, 2) NOT NULL,
        stock INT DEFAULT 0,
        created_at DATETIME2 DEFAULT GETDATE()
    );
END
GO

-- Orders table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='orders' AND xtype='U')
BEGIN
    CREATE TABLE orders (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        status NVARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
        created_at DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
END
GO

-- Order items table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='order_items' AND xtype='U')
BEGIN
    CREATE TABLE order_items (
        id INT IDENTITY(1,1) PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
    );
END
GO

-- Insert sample users (only if empty)
IF NOT EXISTS (SELECT 1 FROM users)
BEGIN
    INSERT INTO users (username, email) VALUES
        ('john_doe', 'john@example.com'),
        ('jane_smith', 'jane@example.com'),
        ('bob_wilson', 'bob@example.com'),
        ('alice_brown', 'alice@example.com'),
        ('charlie_davis', 'charlie@example.com');
END
GO

-- Insert sample products (only if empty)
IF NOT EXISTS (SELECT 1 FROM products)
BEGIN
    INSERT INTO products (name, description, price, stock) VALUES
        ('Laptop Pro', 'High-performance laptop for professionals', 1299.99, 50),
        ('Wireless Mouse', 'Ergonomic wireless mouse', 49.99, 200),
        ('USB-C Hub', '7-in-1 USB-C hub with HDMI', 79.99, 150),
        ('Mechanical Keyboard', 'RGB mechanical keyboard', 129.99, 100),
        ('Monitor 27"', '4K IPS monitor', 449.99, 30),
        ('Webcam HD', '1080p webcam with microphone', 89.99, 75),
        ('Headphones', 'Noise-cancelling wireless headphones', 199.99, 60),
        ('External SSD', '1TB portable SSD', 149.99, 120);
END
GO

-- Insert sample orders (only if empty)
IF NOT EXISTS (SELECT 1 FROM orders)
BEGIN
    INSERT INTO orders (user_id, total_amount, status) VALUES
        (1, 1349.98, 'delivered'),
        (2, 279.97, 'shipped'),
        (3, 449.99, 'processing'),
        (1, 129.99, 'pending'),
        (4, 649.97, 'delivered');
END
GO

-- Insert sample order items (only if empty)
IF NOT EXISTS (SELECT 1 FROM order_items)
BEGIN
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
END
GO

-- Create a view for reporting
IF EXISTS (SELECT * FROM sys.views WHERE name = 'order_summary')
    DROP VIEW order_summary;
GO

CREATE VIEW order_summary AS
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
GO

-- Create indexes for better query performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_orders_user_id')
    CREATE INDEX idx_orders_user_id ON orders(user_id);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_orders_status')
    CREATE INDEX idx_orders_status ON orders(status);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_order_items_order_id')
    CREATE INDEX idx_order_items_order_id ON order_items(order_id);
GO

-- Create trigger for updated_at
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_users_updated_at')
    DROP TRIGGER trg_users_updated_at;
GO

CREATE TRIGGER trg_users_updated_at
ON users
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE users
    SET updated_at = GETDATE()
    FROM users u
    INNER JOIN inserted i ON u.id = i.id;
END
GO

PRINT 'SQL Server test database initialized successfully!';
GO
