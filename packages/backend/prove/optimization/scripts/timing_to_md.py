import argparse
import json
import os
from collections import defaultdict


def load_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def format_seconds(ms: float) -> str:
    return f"{(ms / 1000.0):,.6f} s"


def format_dims(dims):
    if not dims:
        return "-"
    if len(dims) == 1:
        return f"{dims[0]}"
    return "x".join(str(d) for d in dims)


def sizes_to_string(sizes):
    if not sizes:
        return "-"
    parts = []
    for item in sizes:
        label = item.get("label", "size")
        dims = item.get("dims", [])
        parts.append(f"{label}={format_dims(dims)}")
    return ", ".join(parts)


def parse_poly_event(name: str):
    # Expected: poly.<op>.<proveX>.<var>
    parts = name.split(".")
    if len(parts) < 4:
        return None
    if parts[0] != "poly":
        return None
    op = parts[1]
    module = None
    var = parts[-1]
    for part in parts[2:-1]:
        if part.startswith("prove"):
            module = part
            break
    if module is None:
        module = parts[2]
    return op, module, var


def parse_encode_event(name: str):
    # Expected: proveX.encode.<var>
    parts = name.split(".")
    if len(parts) < 3:
        return None
    module = None
    var = parts[-1]
    for part in parts:
        if part.startswith("prove"):
            module = part
            break
    if module is None or "encode" not in parts:
        return None
    return module, var


def parse_init_event(name: str):
    # Expected: init.<phase>.<var> or init.total
    parts = name.split(".")
    if not parts or parts[0] != "init":
        return None
    if name == "init.total":
        return ("total", "init")
    if len(parts) < 3:
        return None
    phase = parts[1]
    var = parts[-1]
    return phase, var


def build_report(data: dict) -> str:
    total_wall_ms = data.get("total_wall_ms", 0.0)
    summary = data.get("summary", {})
    events = data.get("events", [])

    poly_total = 0.0
    encode_total = 0.0
    for e in events:
        ms = e.get("nanos", 0) / 1_000_000.0
        if e.get("category") == "poly":
            poly_total += ms
        elif e.get("category") == "encode":
            encode_total += ms

    poly_op_totals = defaultdict(float)
    poly_event_rows = []
    encode_event_rows = []
    init_event_rows = []
    init_total_ms = None
    for e in events:
        if e.get("name") == "init.total":
            init_total_ms = e.get("nanos", 0) / 1_000_000.0
        if e.get("category") in ("load", "build", "init") and e.get("name", "").startswith("init."):
            parsed = parse_init_event(e.get("name", ""))
            if parsed is not None and e.get("name") != "init.total":
                phase, var = parsed
                ms = e.get("nanos", 0) / 1_000_000.0
                init_event_rows.append(
                    {
                        "phase": phase,
                        "var": var,
                        "ms": ms,
                        "sizes": sizes_to_string(e.get("sizes", [])),
                    }
                )
        if e.get("category") != "poly":
            if e.get("category") == "encode":
                parsed = parse_encode_event(e.get("name", ""))
                if parsed is None:
                    continue
                module, var = parsed
                ms = e.get("nanos", 0) / 1_000_000.0
                encode_event_rows.append(
                    {
                        "module": module,
                        "var": var,
                        "ms": ms,
                        "sizes": sizes_to_string(e.get("sizes", [])),
                    }
                )
            continue
        parsed = parse_poly_event(e.get("name", ""))
        if parsed is None:
            continue
        op, module, var = parsed
        ms = e.get("nanos", 0) / 1_000_000.0
        poly_op_totals[op] += ms
        poly_event_rows.append(
            {
                "op": op,
                "module": module,
                "var": var,
                "ms": ms,
                "sizes": sizes_to_string(e.get("sizes", [])),
            }
        )

    lines = []
    lines.append("# Prove Timing Report")
    lines.append("")

    lines.append("## Total Time")
    lines.append("")
    lines.append("| item | value |")
    lines.append("| --- | --- |")
    lines.append(f"| total_wall | {format_seconds(total_wall_ms)} |")
    lines.append("")

    setup_params = data.get("setup_params")
    if isinstance(setup_params, dict):
        lines.append("## Setup Parameters")
        lines.append("")
        lines.append("| param | value |")
        lines.append("| --- | --- |")
        for key in [
            "l",
            "l_user_out",
            "l_user",
            "l_block",
            "l_D",
            "m_D",
            "n",
            "s_D",
            "s_max",
        ]:
            if key in setup_params:
                lines.append(f"| {key} | {setup_params[key]} |")
        lines.append("")

    lines.append("## Module Times (init + prove0~prove4)")
    lines.append("")
    lines.append("| module | total | poly | encode |")
    lines.append("| --- | --- | --- | --- |")
    if init_total_ms is not None:
        lines.append(f"| init | {format_seconds(init_total_ms)} | - | - |")
    for module in ["prove0", "prove1", "prove2", "prove3", "prove4"]:
        item = summary.get(module, {})
        lines.append(
            f"| {module} | {format_seconds(item.get('total_ms', 0.0))} | "
            f"{format_seconds(item.get('poly_ms', 0.0))} | {format_seconds(item.get('encode_ms', 0.0))} |"
        )
    lines.append("")

    if init_event_rows:
        lines.append("## Init Details (load/build)")
        lines.append("")
        lines.append("| phase | variable | time | dims |")
        lines.append("| --- | --- | --- | --- |")
        for row in sorted(init_event_rows, key=lambda r: (r["phase"], r["var"])):
            lines.append(
                f"| {row['phase']} | {row['var']} | {format_seconds(row['ms'])} | {row['sizes']} |"
            )
        lines.append("")

    lines.append("## Category Totals")
    lines.append("")
    lines.append("| category | total |")
    lines.append("| --- | --- |")
    lines.append(f"| poly | {format_seconds(poly_total)} |")
    lines.append(f"| encode | {format_seconds(encode_total)} |")
    lines.append("")

    lines.append("## Poly Operation Totals")
    lines.append("")
    lines.append("| operation | total |")
    lines.append("| --- | --- |")
    for op in sorted(poly_op_totals.keys()):
        lines.append(f"| {op} | {format_seconds(poly_op_totals[op])} |")
    lines.append("")

    lines.append("## Poly Operation Details (by variable)")
    lines.append("")
    lines.append("| operation | module | variable | time | dims |")
    lines.append("| --- | --- | --- | --- | --- |")
    for row in sorted(poly_event_rows, key=lambda r: (r["op"], r["module"], r["var"])):
        lines.append(
            f"| {row['op']} | {row['module']} | {row['var']} | {format_seconds(row['ms'])} | {row['sizes']} |"
        )
    lines.append("")

    lines.append("## Encode Details (by variable)")
    lines.append("")
    lines.append("| module | variable | time | dims |")
    lines.append("| --- | --- | --- | --- |")
    for row in sorted(encode_event_rows, key=lambda r: (r["module"], r["var"])):
        lines.append(
            f"| {row['module']} | {row['var']} | {format_seconds(row['ms'])} | {row['sizes']} |"
        )
    lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Convert timing JSON to Markdown report.")
    parser.add_argument(
        "--input",
        required=True,
        help="Path to timing JSON.",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Path to output Markdown file.",
    )
    args = parser.parse_args()

    if not args.input:
        raise SystemExit("Missing --input.")

    input_path = args.input
    output_path = args.output
    if not output_path:
        base, ext = os.path.splitext(input_path)
        output_path = f"{base}.md" if ext else f"{input_path}.md"

    data = load_json(input_path)
    report = build_report(data)

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"Wrote report: {output_path}")


if __name__ == "__main__":
    main()
