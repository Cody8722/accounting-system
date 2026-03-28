"""
routes/__init__.py — Blueprint 註冊入口

呼叫 register_blueprints(app) 將所有路由 Blueprint 掛載至 Flask app。
"""


def register_blueprints(app):
    """將所有 Blueprint 註冊至 Flask app。"""
    from routes.auth import bp as auth_bp
    from routes.budget import bp as budget_bp
    from routes.debts import bp as debts_bp
    from routes.io import bp as io_bp
    from routes.records import bp as records_bp
    from routes.recurring import bp as recurring_bp
    from routes.stats import bp as stats_bp
    from routes.user import bp as user_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(budget_bp)
    app.register_blueprint(debts_bp)
    app.register_blueprint(io_bp)
    app.register_blueprint(records_bp)
    app.register_blueprint(recurring_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(user_bp)
