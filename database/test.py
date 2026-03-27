from pathlib import Path

env_path = Path('.') / '.env'
load_dotenv(dotenv_path=env_path)

print(_env["SECRET_KEY"])