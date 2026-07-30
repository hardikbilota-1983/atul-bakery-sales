"""
Sales Analytics Dashboard — Streamlit entry point.

Run from the project directory:
    pip install -r requirements.txt
    streamlit run app.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure project root is importable when launched via `streamlit run app.py`
_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import pandas as pd
import streamlit as st

from src.charts import (
    bar_category,
    bar_channel,
    bar_region,
    bar_top_products,
    grouped_profit_revenue,
    line_sales_trend,
    pie_category,
)
from src.config import DEFAULT_DATA_DIR, THEME_COLORS
from src.ingestion import ingest_folder, ingest_uploaded_files
from src.insights import build_insight_paragraphs, category_best_worst, detect_revenue_anomalies
from src.kpis import (
    category_sales,
    channel_sales,
    compute_kpis,
    growth_rates,
    monthly_revenue,
    region_sales,
    top_products,
)
from src.transform import build_unified_dataset

st.set_page_config(
    page_title="Sales Analytics",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)


@st.cache_data(show_spinner=False)
def load_and_transform(data_dir: str) -> pd.DataFrame:
    """
    Ingest every supported file from ``data_dir`` and return a unified DataFrame.

    Cached so filters/charts stay snappy when only sidebar selections change.
    """
    folder = Path(data_dir)
    raw = ingest_folder(folder)
    return build_unified_dataset(raw)


@st.cache_data(show_spinner=False)
def transform_raw_frame(_raw: pd.DataFrame) -> pd.DataFrame:
    """Cache transformed uploads (hash by pandas internals is avoided via underscore arg)."""
    return build_unified_dataset(_raw)


def _inject_css() -> None:
    """Light theming for KPI cards and headings."""
    st.markdown(
        f"""
        <style>
        .block-container {{ padding-top: 1.2rem; }}
        div[data-testid="stMetric"] {{
            background: linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%);
            border: 1px solid {THEME_COLORS["grid"]};
            border-radius: 10px;
            padding: 12px 16px;
        }}
        h1 {{ color: {THEME_COLORS["primary"]}; font-weight: 700; }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def main() -> None:
    _inject_css()
    st.title("Sales Analytics Dashboard")
    st.caption("Unified view across CSV, Excel, and JSON exports — filters apply to all charts below.")

    with st.sidebar:
        st.header("Data source")
        data_path = st.text_input(
            "Data folder path",
            value=str(DEFAULT_DATA_DIR),
            help="Absolute or relative path containing sales files.",
        )
        uploads = st.file_uploader(
            "Add / override with uploads",
            type=["csv", "xlsx", "xls", "json", "jsonl"],
            accept_multiple_files=True,
            help="Merged with folder data when enabled below.",
        )
        merge_uploads = st.checkbox("Merge uploads with folder files", value=True)
        if st.button("Refresh data cache"):
            st.cache_data.clear()
            st.rerun()

        st.divider()
        st.header("Filters")

    # Load data
    folder_df = load_and_transform(data_path)
    upload_df = pd.DataFrame()
    if uploads:
        raw_up = ingest_uploaded_files(list(uploads))
        upload_df = transform_raw_frame(raw_up)

    if uploads and not merge_uploads:
        df_all = upload_df if not upload_df.empty else folder_df
    elif uploads and merge_uploads:
        if not folder_df.empty and not upload_df.empty:
            df_all = pd.concat([folder_df, upload_df], ignore_index=True).drop_duplicates()
        elif not upload_df.empty:
            df_all = upload_df
        else:
            df_all = folder_df
    else:
        df_all = folder_df

    if df_all.empty:
        st.warning(
            "No data loaded. Check the folder path, file formats, or upload files. "
            f"Expected CSV / Excel / JSON in: `{data_path}`"
        )
        st.stop()

    # Sidebar filters (need df_all)
    dmin = pd.to_datetime(df_all["order_date"], errors="coerce").min()
    dmax = pd.to_datetime(df_all["order_date"], errors="coerce").max()
    if pd.isna(dmin):
        dmin = pd.Timestamp.now().normalize() - pd.Timedelta(days=365)
    if pd.isna(dmax):
        dmax = pd.Timestamp.now().normalize()

    with st.sidebar:
        dr = st.date_input(
            "Date range",
            value=(dmin.date(), dmax.date()),
            min_value=dmin.date(),
            max_value=dmax.date(),
        )
        if isinstance(dr, tuple) and len(dr) == 2:
            start_d, end_d = dr
        else:
            start_d = end_d = dr if not isinstance(dr, tuple) else dr[0]

        cats = sorted(df_all["category"].dropna().astype(str).unique().tolist())
        regions = sorted(df_all["region"].dropna().astype(str).unique().tolist())
        chans = sorted(df_all["channel"].dropna().astype(str).unique().tolist())

        cat_pick = st.multiselect("Category", options=cats, default=[])
        reg_pick = st.multiselect("Region", options=regions, default=[])
        chan_pick = st.multiselect("Channel", options=chans, default=[])

    # Apply filters
    dff = df_all.copy()
    dff["_d"] = pd.to_datetime(dff["order_date"], errors="coerce")
    dff = dff.loc[(dff["_d"].dt.date >= start_d) & (dff["_d"].dt.date <= end_d)]
    if cat_pick:
        dff = dff.loc[dff["category"].astype(str).isin(cat_pick)]
    if reg_pick:
        dff = dff.loc[dff["region"].astype(str).isin(reg_pick)]
    if chan_pick:
        dff = dff.loc[dff["channel"].astype(str).isin(chan_pick)]
    dff = dff.drop(columns=["_d"], errors="ignore")

    kpis = compute_kpis(dff)
    monthly = monthly_revenue(dff)
    growth = growth_rates(monthly)
    anomalies = detect_revenue_anomalies(monthly)
    cat_perf = category_best_worst(dff)
    insight_lines = build_insight_paragraphs(dff, kpis, growth, anomalies, cat_perf)

    # KPI row
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.metric("Total revenue", f"${kpis.total_revenue:,.0f}")
        st.metric("Total profit", f"${kpis.total_profit:,.0f}")
    with c2:
        st.metric("Profit margin", f"{kpis.profit_margin_pct:.1f}%")
        st.metric("Avg order value *", f"${kpis.average_order_value:,.2f}")
    with c3:
        st.metric("Total orders *", f"{kpis.total_orders:,}")
        st.metric("Quantity sold", f"{kpis.total_quantity:,.0f}")
    with c4:
        st.metric("Top category", kpis.top_category[:28] + ("…" if len(kpis.top_category) > 28 else ""))
        st.metric("Top product", kpis.top_product[:28] + ("…" if len(kpis.top_product) > 28 else ""))

    st.caption(
        "*If your files have no `order_id`, \"Total orders\" counts line-item records; "
        "AOV = revenue ÷ that count. Add an `order_id` column for true order counts."
    )

    with st.expander("Automated insights", expanded=True):
        for line in insight_lines:
            st.markdown(f"- {line}")

    st.subheader("Trends & mix")
    r1c1, r1c2 = st.columns((1.4, 1))
    with r1c1:
        st.plotly_chart(line_sales_trend(monthly), use_container_width=True)
    with r1c2:
        st.plotly_chart(pie_category(category_sales(dff)), use_container_width=True)

    r2c1, r2c2 = st.columns(2)
    with r2c1:
        st.plotly_chart(bar_category(category_sales(dff)), use_container_width=True)
    with r2c2:
        st.plotly_chart(bar_top_products(top_products(dff, 10)), use_container_width=True)

    r3c1, r3c2, r3c3 = st.columns(3)
    with r3c1:
        st.plotly_chart(bar_region(region_sales(dff)), use_container_width=True)
    with r3c2:
        st.plotly_chart(bar_channel(channel_sales(dff)), use_container_width=True)
    with r3c3:
        st.plotly_chart(grouped_profit_revenue(monthly), use_container_width=True)

    st.subheader("Growth (from monthly totals)")
    gcol1, gcol2, gcol3 = st.columns(3)
    with gcol1:
        mom = growth.get("mom_pct")
        st.metric("MoM revenue change", "—" if mom is None else f"{mom:+.1f}%")
    with gcol2:
        yoy = growth.get("yoy_pct")
        st.metric("YoY revenue change (same month)", "—" if yoy is None else f"{yoy:+.1f}%")
    with gcol3:
        st.metric("Months in view", str(monthly["month_period"].nunique()) if not monthly.empty else "0")

    with st.expander("Filtered data preview"):
        st.dataframe(dff.head(200), use_container_width=True)


if __name__ == "__main__":
    main()
