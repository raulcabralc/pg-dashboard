import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Check,
  ChevronDown,
  Copy,
  Database,
  Download,
  Eye,
  Moon,
  Play,
  Plus,
  Rows3,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import brandIconUrl from "./pg-dashboard-icon.png";
import "./styles.css";

const numberTypes = new Set([
  "bigint",
  "integer",
  "numeric",
  "real",
  "smallint",
  "double precision",
]);
const textTypes = new Set(["character", "character varying", "text", "uuid"]);
const dateTypes = new Set([
  "date",
  "time without time zone",
  "time with time zone",
  "timestamp without time zone",
  "timestamp with time zone",
]);

const compactDataTypes = new Map([
  ["bigint", "bigint"],
  ["boolean", "bool"],
  ["character", "char"],
  ["character varying", "varchar"],
  ["date", "date"],
  ["double precision", "dbl"],
  ["integer", "int"],
  ["json", "json"],
  ["jsonb", "jsonb"],
  ["numeric", "num"],
  ["real", "real"],
  ["smallint", "small"],
  ["text", "text"],
  ["time without time zone", "time"],
  ["time with time zone", "timetz"],
  ["timestamp without time zone", "tmstp"],
  ["timestamp with time zone", "tstz"],
  ["uuid", "uuid"],
]);

function formatDataType(dataType) {
  return compactDataTypes.get(dataType) || dataType.split(" ")[0] || dataType;
}

function shouldSelectColumnByDefault(columnName) {
  const normalizedColumnName = columnName.toLowerCase().replace(/[_\s-]/g, "");
  const hiddenColumnNames = new Set([
    "atualizado",
    "created",
    "createdat",
    "criado",
    "updated",
    "updatedat",
  ]);

  return !hiddenColumnNames.has(normalizedColumnName);
}

function toCsv(rows) {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const escapeValue = (value) => {
    if (value === null || value === undefined) {
      return "";
    }

    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escapeValue(row[header])).join(","),
    ),
  ].join("\n");
}

function downloadCsv(rows, fileName) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

const operatorOptions = [
  { value: "equals", label: "Equals" },
  { value: "contains", label: "Contains" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" },
  { value: "greaterThan", label: "Greater than" },
  { value: "lessThan", label: "Less than" },
  { value: "isNull", label: "Is null" },
  { value: "isNotNull", label: "Is not null" },
];

const allowedOperatorsByKind = {
  basic: ["equals", "notEquals", "isNull", "isNotNull"],
  boolean: ["equals", "notEquals", "isNull", "isNotNull"],
  date: [
    "equals",
    "notEquals",
    "greaterThan",
    "lessThan",
    "isNull",
    "isNotNull",
  ],
  number: [
    "equals",
    "notEquals",
    "greaterThan",
    "lessThan",
    "isNull",
    "isNotNull",
  ],
  text: [
    "equals",
    "notEquals",
    "contains",
    "startsWith",
    "endsWith",
    "isNull",
    "isNotNull",
  ],
};

function getColumnKind(dataType) {
  if (numberTypes.has(dataType)) {
    return "number";
  }

  if (dateTypes.has(dataType)) {
    return "date";
  }

  if (dataType === "boolean") {
    return "boolean";
  }

  if (textTypes.has(dataType)) {
    return "text";
  }

  return "basic";
}

function getOperatorOptionsForDataType(dataType) {
  const kind = getColumnKind(dataType);
  const allowedOperators = allowedOperatorsByKind[kind];

  return operatorOptions.filter((option) =>
    allowedOperators.includes(option.value),
  );
}

function sanitizeFilterValue(value, dataType) {
  const kind = getColumnKind(dataType);

  if (kind === "number") {
    return value
      .replace(/[^\d.-]/g, "")
      .replace(/(?!^)-/g, "")
      .replace(/(\..*)\./g, "$1");
  }

  if (kind === "boolean") {
    return value
      .replace(/[^a-z]/gi, "")
      .slice(0, 5)
      .toLowerCase();
  }

  return value;
}

function CustomDropdown({ ariaLabel, value, options, onChange, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  return (
    <div className="customSelect" ref={rootRef}>
      <button
        type="button"
        className="customSelectTrigger"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((currentIsOpen) => !currentIsOpen)}
      >
        <span className="customSelectLabel">
          <span>{selectedOption?.label || placeholder}</span>
          {selectedOption?.isView ? (
            <span className="viewBadge">
              <Eye size={12} />
              VIEW
            </span>
          ) : null}
        </span>
        <ChevronDown className={isOpen ? "chevronOpen" : ""} size={16} />
      </button>

      {isOpen ? (
        <div className="customSelectMenu">
          {options.map((option) => (
            <button
              type="button"
              className="customSelectOption"
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              <span className="customSelectLabel">
                <span>{option.label}</span>
                {option.isView ? (
                  <span className="viewBadge">
                    <Eye size={12} />
                    VIEW
                  </span>
                ) : null}
              </span>
              {option.value === value ? <Check size={15} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

function App() {
  const [themeName, setThemeName] = useState(() => {
    return localStorage.getItem("pgDashboardTheme") || "light";
  });
  const [databaseName, setDatabaseName] = useState("");
  const [relations, setRelations] = useState([]);
  const [selectedTableName, setSelectedTableName] = useState("");
  const [columns, setColumns] = useState([]);
  const [selectedColumnNames, setSelectedColumnNames] = useState([]);
  const [filters, setFilters] = useState([]);
  const [columnValueOptions, setColumnValueOptions] = useState({});
  const [rows, setRows] = useState([]);
  const [rowLimit, setRowLimit] = useState("100");
  const [hasMoreRows, setHasMoreRows] = useState(false);
  const [hasRunReport, setHasRunReport] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [areRowsLeaving, setAreRowsLeaving] = useState(false);
  const [copiedCellId, setCopiedCellId] = useState("");
  const [hoveredCell, setHoveredCell] = useState(null);
  const [removingFilterIds, setRemovingFilterIds] = useState([]);
  const [isQueryTransitioning, setIsQueryTransitioning] = useState(false);
  const [brandImageFailed, setBrandImageFailed] = useState(false);
  const copiedTimeoutRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const queryTransitionTimeoutRef = useRef(null);

  const selectedColumns = useMemo(
    () =>
      columns.filter((column) =>
        selectedColumnNames.includes(column.columnName),
      ),
    [columns, selectedColumnNames],
  );
  const tableOptions = useMemo(
    () =>
      relations.map((relation) => ({
        value: relation.tableName,
        label: relation.tableName,
        isView: relation.isView,
      })),
    [relations],
  );
  const columnOptions = useMemo(
    () =>
      columns.map((column) => ({
        value: column.columnName,
        label: column.columnName,
      })),
    [columns],
  );

  function getColumnValueOptionsKey(tableName, columnName) {
    return `${tableName}:${columnName}`;
  }

  useEffect(() => {
    document.documentElement.dataset.theme = themeName;
    localStorage.setItem("pgDashboardTheme", themeName);
  }, [themeName]);

  useEffect(() => {
    fetch("./api/health")
      .then(async (response) => {
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            payload.error?.message || "Could not load database info.",
          );
        }

        return payload;
      })
      .then((payload) => setDatabaseName(payload.databaseName || ""))
      .catch(() => setDatabaseName(""));

    fetch("./api/tables")
      .then(async (response) => {
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error?.message || "Could not load tables.");
        }

        return payload;
      })
      .then((payload) => {
        const nextRelations =
          payload.relations ||
          (payload.tables || []).map((tableName) => ({
            tableName,
            isView: false,
            relationType: "table",
          }));
        setRelations(nextRelations);
        setSelectedTableName(nextRelations[0]?.tableName || "");
      })
      .catch((error) => toast.error(error.message));
  }, []);

  useEffect(() => {
    if (!selectedTableName) {
      return;
    }

    setIsQueryTransitioning(true);

    if (queryTransitionTimeoutRef.current) {
      window.clearTimeout(queryTransitionTimeoutRef.current);
    }

    fetch(`./api/tables/${encodeURIComponent(selectedTableName)}/columns`)
      .then(async (response) => {
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error?.message || "Could not load columns.");
        }

        return payload;
      })
      .then((payload) => {
        const nextColumns = payload.columns || [];
        const defaultColumnNames = nextColumns
          .filter((column) => shouldSelectColumnByDefault(column.columnName))
          .map((column) => column.columnName);
        setColumns(nextColumns);
        setSelectedColumnNames(
          defaultColumnNames.length
            ? defaultColumnNames
            : nextColumns.map((column) => column.columnName),
        );
        setFilters([]);
        setColumnValueOptions({});
        setRows([]);
        setHasMoreRows(false);
        setHasRunReport(false);
        queryTransitionTimeoutRef.current = window.setTimeout(() => {
          setIsQueryTransitioning(false);
        }, 180);
      })
      .catch((error) => {
        setIsQueryTransitioning(false);
        toast.error(error.message);
      });
  }, [selectedTableName]);

  function toggleColumn(columnName) {
    setSelectedColumnNames((currentColumnNames) =>
      currentColumnNames.includes(columnName)
        ? currentColumnNames.filter(
            (currentColumnName) => currentColumnName !== columnName,
          )
        : [...currentColumnNames, columnName],
    );
  }

  function addFilter() {
    const firstColumn = columns[0];

    if (!firstColumn) {
      return;
    }

    setFilters((currentFilters) => [
      ...currentFilters,
      {
        id: crypto.randomUUID(),
        columnName: firstColumn.columnName,
        operator: "equals",
        value: "",
      },
    ]);
  }

  function updateFilter(index, patch) {
    setFilters((currentFilters) =>
      currentFilters.map((filter, filterIndex) =>
        filterIndex === index ? { ...filter, ...patch } : filter,
      ),
    );
  }

  function updateFilterColumn(index, columnName) {
    const column = columns.find(
      (candidate) => candidate.columnName === columnName,
    );
    const nextOperatorOptions = getOperatorOptionsForDataType(column?.dataType);

    setFilters((currentFilters) =>
      currentFilters.map((filter, filterIndex) => {
        if (filterIndex !== index) {
          return filter;
        }

        const hasValidOperator = nextOperatorOptions.some(
          (option) => option.value === filter.operator,
        );

        return {
          ...filter,
          columnName,
          operator: hasValidOperator
            ? filter.operator
            : nextOperatorOptions[0].value,
          value: sanitizeFilterValue(filter.value, column?.dataType),
        };
      }),
    );
  }

  function loadColumnValueOptions(columnName) {
    if (!selectedTableName || !columnName) {
      return;
    }

    const optionsKey = getColumnValueOptionsKey(selectedTableName, columnName);

    if (columnValueOptions[optionsKey]) {
      return;
    }

    fetch(
      `./api/tables/${encodeURIComponent(selectedTableName)}/columns/${encodeURIComponent(columnName)}/values`,
    )
      .then(async (response) => {
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error?.message || "Could not load values.");
        }

        return payload;
      })
      .then((payload) => {
        setColumnValueOptions((currentOptions) => ({
          ...currentOptions,
          [optionsKey]: payload.useDropdown
            ? payload.values.map((value) => ({ value, label: value }))
            : [],
        }));
      })
      .catch(() => {
        setColumnValueOptions((currentOptions) => ({
          ...currentOptions,
          [optionsKey]: [],
        }));
      });
  }

  useEffect(() => {
    filters.forEach((filter) => {
      const column = columns.find(
        (candidate) => candidate.columnName === filter.columnName,
      );
      const kind = getColumnKind(column?.dataType);

      if (kind === "text" || kind === "boolean" || kind === "basic") {
        loadColumnValueOptions(filter.columnName);
      }
    });
  }, [filters, columns, selectedTableName]);

  function updateFilterValue(index, value) {
    setFilters((currentFilters) =>
      currentFilters.map((filter, filterIndex) => {
        if (filterIndex !== index) {
          return filter;
        }

        const column = columns.find(
          (candidate) => candidate.columnName === filter.columnName,
        );

        return {
          ...filter,
          value: sanitizeFilterValue(value, column?.dataType),
        };
      }),
    );
  }

  function removeFilter(index) {
    const filter = filters[index];

    if (!filter) {
      return;
    }

    setRemovingFilterIds((currentIds) => [...currentIds, filter.id]);
    window.setTimeout(() => {
      setFilters((currentFilters) =>
        currentFilters.filter(
          (currentFilter) => currentFilter.id !== filter.id,
        ),
      );
      setRemovingFilterIds((currentIds) =>
        currentIds.filter((filterId) => filterId !== filter.id),
      );
    }, 180);
  }

  function clearFilters() {
    if (!filters.length) {
      return;
    }

    const filterIds = filters.map((filter) => filter.id);
    setRemovingFilterIds((currentIds) => [...currentIds, ...filterIds]);
    window.setTimeout(() => {
      setFilters([]);
      setRemovingFilterIds((currentIds) =>
        currentIds.filter((filterId) => !filterIds.includes(filterId)),
      );
    }, 180);
  }

  async function copyGridValue(cellId, value) {
    const text = value === null || value === undefined ? "NULL" : String(value);

    try {
      await copyTextToClipboard(text);
      setCopiedCellId(cellId);

      if (copiedTimeoutRef.current) {
        window.clearTimeout(copiedTimeoutRef.current);
      }

      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopiedCellId("");
      }, 1400);
    } catch (error) {
      toast.error("Could not copy value.");
    }
  }

  function showCellTooltipLater(cellId, value) {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
    }

    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredCell({
        id: cellId,
        text: value === null || value === undefined ? "NULL" : String(value),
      });
    }, 700);
  }

  function hideCellTooltip() {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
    }

    setHoveredCell(null);
  }

  async function generateReport(event) {
    event.preventDefault();
    const invalidFilter = filters.find((filter) => {
      if (filter.operator === "isNull" || filter.operator === "isNotNull") {
        return false;
      }

      return filter.value === "";
    });

    if (invalidFilter) {
      toast.error("Fill in filter values before running.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("./api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableName: selectedTableName,
          columnNames: selectedColumnNames,
          filters,
          limit: rowLimit,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message || "Could not generate report.");
      }

      const nextRows = payload.rows || [];
      setAreRowsLeaving(rows.length > 0);
      window.setTimeout(
        () => {
          setRows(nextRows);
          setAreRowsLeaving(false);
        },
        rows.length > 0 ? 180 : 0,
      );
      setHasMoreRows(Boolean(payload.hasMore));
      setHasRunReport(true);
      toast.success(`${payload.rowCount || 0} rows loaded`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="shell">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3200,
          className: "dashboardToast",
          success: {
            iconTheme: {
              primary: "#148a5b",
              secondary: "#ffffff",
            },
          },
          error: {
            iconTheme: {
              primary: "#F25F4C",
              secondary: "#ffffff",
            },
          },
        }}
      />
      <section className="toolbar">
        <div className="brandBlock">
          <div className="brandIcon">
            {!brandImageFailed ? (
              <img
                alt=""
                src={brandIconUrl}
                onError={() => setBrandImageFailed(true)}
              />
            ) : (
              <Database size={18} />
            )}
          </div>
          <div>
            <h1>PG Dashboard</h1>
            <p className="brandDatabase">
              <Database size={13} />
              {databaseName || "Database not loaded"}
            </p>
          </div>
        </div>
        <div className="toolbarActions">
          <div className="resultMeta">
            <Rows3 size={15} />
            <span>
              {rows.length ? `${rows.length} rows loaded` : "Ready to run"}
            </span>
            {hasMoreRows ? (
              <span className="moreRowsBadge">
                <Sparkles size={12} />
                More after limit
              </span>
            ) : rows.length ? (
              <span className="allRowsBadge">All loaded</span>
            ) : null}
          </div>
          <label className="limitControl">
            <span className="limitLabel">
              <SlidersHorizontal size={14} />
              Limit
            </span>
            <input
              aria-label="Row limit"
              inputMode="numeric"
              value={rowLimit}
              onChange={(event) =>
                setRowLimit(event.target.value.replace(/\D/g, "").slice(0, 3))
              }
            />
          </label>
          <button
            type="button"
            className="iconButton"
            onClick={() =>
              setThemeName((currentThemeName) =>
                currentThemeName === "dark" ? "light" : "dark",
              )
            }
            title={
              themeName === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
          >
            {themeName === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            type="button"
            className="buttonWithIcon"
            onClick={() =>
              downloadCsv(rows, `${selectedTableName || "report"}.csv`)
            }
            disabled={!rows.length}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </section>

      <form className="layout" onSubmit={generateReport}>
        <aside className="panel">
          <div className="fieldGroup">
            <span>Table</span>
            <CustomDropdown
              ariaLabel="Select table"
              value={selectedTableName}
              options={tableOptions}
              onChange={setSelectedTableName}
              placeholder="Select table"
            />
          </div>

          <div className="panelSection">
            <div className="groupTitle">Columns</div>
            <div className="checkList">
              {columns.map((column) => (
                <label key={column.columnName} className="checkRow">
                  <input
                    type="checkbox"
                    checked={selectedColumnNames.includes(column.columnName)}
                    onChange={() => toggleColumn(column.columnName)}
                  />
                  <span className="checkDot" aria-hidden="true" />
                  <span className="columnName">{column.columnName}</span>
                  <small className="typePill" title={column.dataType}>
                    {formatDataType(column.dataType)}
                  </small>
                </label>
              ))}
            </div>
          </div>

          <div className="panelSection filters">
            <div className="filtersHeader">
              <div>
                <div className="groupTitle">Filters</div>
                <p className="sectionHint">Refine rows before running.</p>
              </div>
              <div className="filtersActions">
                <button
                  type="button"
                  className="iconButton clearFiltersButton"
                  onClick={clearFilters}
                  disabled={!filters.length}
                  title="Clear filters"
                >
                  <X size={17} />
                </button>
                <button
                  type="button"
                  className="iconButton addFilterButton"
                  onClick={addFilter}
                  title="Add filter"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            <div className="filterList">
              {!filters.length ? (
                <div className="emptyFilters">
                  <Search size={16} />
                  <span>No filters applied</span>
                </div>
              ) : null}

              {filters.map((filter, index) => {
                const column = columns.find(
                  (candidate) => candidate.columnName === filter.columnName,
                );
                const isNumericValue = numberTypes.has(column?.dataType);
                const valueOptions =
                  columnValueOptions[
                    getColumnValueOptionsKey(
                      selectedTableName,
                      filter.columnName,
                    )
                  ] || [];
                const shouldUseValueDropdown =
                  valueOptions.length > 0 &&
                  filter.operator !== "isNull" &&
                  filter.operator !== "isNotNull";

                return (
                  <div
                    key={filter.id}
                    className={
                      removingFilterIds.includes(filter.id)
                        ? "filterCard filterCardLeaving"
                        : "filterCard"
                    }
                  >
                    <div className="filterLabel">
                      <span>Where</span>
                      <strong>#{index + 1}</strong>
                    </div>
                    <CustomDropdown
                      ariaLabel="Filter column"
                      value={filter.columnName}
                      options={columnOptions}
                      onChange={(columnName) =>
                        updateFilterColumn(index, columnName)
                      }
                      placeholder="Column"
                    />
                    <CustomDropdown
                      ariaLabel="Filter operator"
                      value={filter.operator}
                      options={getOperatorOptionsForDataType(column?.dataType)}
                      onChange={(operator) => updateFilter(index, { operator })}
                      placeholder="Operator"
                    />
                    <div className="filterValueRow">
                      {shouldUseValueDropdown ? (
                        <CustomDropdown
                          ariaLabel="Filter value"
                          value={filter.value}
                          options={valueOptions}
                          onChange={(value) => updateFilter(index, { value })}
                          placeholder="Value"
                        />
                      ) : (
                        <input
                          aria-label="Filter value"
                          inputMode={isNumericValue ? "numeric" : "text"}
                          value={filter.value}
                          placeholder="Value"
                          onChange={(event) =>
                            updateFilterValue(index, event.target.value)
                          }
                          disabled={
                            filter.operator === "isNull" ||
                            filter.operator === "isNotNull"
                          }
                        />
                      )}
                      <button
                        type="button"
                        className="iconButton dangerButton"
                        onClick={() => removeFilter(index)}
                        title="Remove filter"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              className="primary buttonWithIcon"
              type="submit"
              disabled={isLoading || !selectedColumnNames.length}
            >
              <Play size={16} />
              {isLoading ? "Running..." : "Run"}
            </button>
          </div>
        </aside>

        <section className="workspace">
          <div
            className={
              [
                "tableWrap",
                isQueryTransitioning ? "tableWrapTransitioning" : "",
              ]
                .filter(Boolean)
                .join(" ")
            }
          >
            {!hasRunReport ? (
              <div className="emptyQueryState">
                <Rows3 size={20} />
                <strong>Ready when you are</strong>
                <span>
                  Select columns, add optional filters, and run a report.
                </span>
              </div>
            ) : null}
            {hasRunReport && !isLoading && rows.length === 0 ? (
              <div className="emptyQueryState">
                <Search size={20} />
                <strong>No results</strong>
                <span>
                  Try changing filters, selected columns, or the row limit.
                </span>
              </div>
            ) : null}
            <div className="dataGrid" role="table">
              <div className="dataGridHeader" role="row">
                {columns.map((column) => {
                  const isSelected = selectedColumnNames.includes(
                    column.columnName,
                  );

                  return (
                    <div
                      className={
                        isSelected
                          ? "dataGridCell dataGridHeadCell"
                          : "dataGridCell dataGridHeadCell dataGridCellHidden"
                      }
                      key={column.columnName}
                      role="columnheader"
                    >
                      <span className="dataGridContent">{column.columnName}</span>
                    </div>
                  );
                })}
              </div>

              <div className="dataGridBody" role="rowgroup">
                {rows.map((row, index) => (
                  <div
                    className={
                      areRowsLeaving
                        ? "dataGridRow dataGridRowLeaving"
                        : "dataGridRow"
                    }
                    key={index}
                    role="row"
                  >
                    {columns.map((column) => {
                      const isSelected = selectedColumnNames.includes(
                        column.columnName,
                      );
                      const cellId = `${index}:${column.columnName}`;

                      return (
                        <div
                          className={[
                            "dataGridCell",
                            !isSelected ? "dataGridCellHidden" : "",
                            copiedCellId === cellId ? "copiedCell" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          key={column.columnName}
                          role="cell"
                          onClick={
                            isSelected
                              ? () => copyGridValue(cellId, row[column.columnName])
                              : undefined
                          }
                          onMouseEnter={
                            isSelected
                              ? () =>
                                  showCellTooltipLater(
                                    cellId,
                                    row[column.columnName],
                                  )
                              : undefined
                          }
                          onMouseLeave={hideCellTooltip}
                          onFocus={
                            isSelected
                              ? () =>
                                  showCellTooltipLater(
                                    cellId,
                                    row[column.columnName],
                                  )
                              : undefined
                          }
                          onBlur={hideCellTooltip}
                        >
                          <span className="dataGridContent">
                            {row[column.columnName] === null ? (
                              <span className="nullValue">NULL</span>
                            ) : (
                              String(row[column.columnName] ?? "")
                            )}
                          </span>
                          {copiedCellId === cellId ? (
                            <span className="copyBubble">
                              <Copy size={12} />
                              Copied
                            </span>
                          ) : null}
                          {hoveredCell?.id === cellId && copiedCellId !== cellId ? (
                            <span className="cellTooltip">
                              {hoveredCell.text}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </form>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
