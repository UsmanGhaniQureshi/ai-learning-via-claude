.PHONY: test test-venv install-dev

# Run the test suite. Resolves to the project's detector_env interpreter
# so contributors don't have to remember which python is which. Override
# with PY=python if you want a different interpreter.
PY ?= ./detector_env/Scripts/python.exe

test:
	$(PY) -m pytest tests/ -v

install-dev:
	$(PY) -m pip install -r requirements-dev.txt
