import sqlite3
connection = sqlite3.connect(':memory:')
connection.execute('CREATE TABLE stock(value INTEGER)')
connection.execute('INSERT INTO stock VALUES(1)')
connection.commit()
try:
    with connection:
        connection.execute('UPDATE stock SET value=value-1')
        raise RuntimeError('order failed')
except RuntimeError:
    pass
print(connection.execute('SELECT value FROM stock').fetchone()[0])
connection.close()
