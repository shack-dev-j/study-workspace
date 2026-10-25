"""Data format migrations.

Every module file has a "schema_version". When a format changes:
1. bump CURRENT[module],
2. add a function to MIGRATIONS[module][old_version] that returns the data in
   the next version's format.
storage.Storage backs the file up (backups/migrations/) before migrating.
"""

CURRENT = {}          # module -> current version; default 1
MIGRATIONS = {}       # module -> {from_version: function(data) -> data}


def current_version(module):
    return CURRENT.get(module, 1)


def migrate(module, data):
    """Return (data, changed). Applies migrations one version at a time."""
    target = current_version(module)
    version = int(data.get("schema_version", 1))
    changed = False
    while version < target:
        step = MIGRATIONS.get(module, {}).get(version)
        if step is None:
            raise RuntimeError(f"No migration for {module} from v{version}")
        data = step(data)
        version += 1
        data["schema_version"] = version
        changed = True
    return data, changed
