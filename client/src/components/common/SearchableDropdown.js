import React from 'react';
import { fuzzyIncludes } from '../../utils/searchNormalization';
import '../../styles/SearchableDropdown.css';

const SearchableDropdown = ({
  value,
  onChange,
  options,
  placeholder = 'Выберите значение',
  disabled = false,
  allowClear = true,
  emptyOptionLabel = '— Не выбрано —'
}) => {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const containerRef = React.useRef(null);
  const searchInputRef = React.useRef(null);

  // Debounce search input (200ms)
  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timeout);
  }, [search]);

  // Close dropdown on click outside
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  React.useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setSearch('');
      setDebouncedSearch('');
    }
  }, [open]);

  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === value) || null,
    [options, value]
  );

  const filteredOptions = React.useMemo(() => {
    if (!debouncedSearch) {
      return options;
    }
    return options.filter((option) => fuzzyIncludes(option.label, debouncedSearch));
  }, [options, debouncedSearch]);

  const handleSelect = (newValue) => {
    onChange(newValue);
    setOpen(false);
    setSearch('');
    setDebouncedSearch('');
  };

  const handleToggle = () => {
    if (disabled) return;
    setOpen((prev) => !prev);
  };

  return (
    <div
      className={`searchable-dropdown ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
      ref={containerRef}
    >
      <button
        type="button"
        className="searchable-dropdown-toggle"
        onClick={handleToggle}
        disabled={disabled}
      >
        <span className={`searchable-dropdown-value ${selectedOption ? '' : 'placeholder'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="searchable-dropdown-icon">▾</span>
      </button>

      {allowClear && value && (
        <button
          type="button"
          className="searchable-dropdown-clear"
          onClick={(event) => {
            event.stopPropagation();
            onChange('');
            setSearch('');
            setDebouncedSearch('');
          }}
          title="Очистить выбор"
        >
          ×
        </button>
      )}

      {open && (
        <div className="searchable-dropdown-menu">
          <input
            type="text"
            className="searchable-dropdown-search"
            ref={searchInputRef}
            placeholder="Поиск..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="searchable-dropdown-list">
            {allowClear && (
              <button
                type="button"
                className={`searchable-dropdown-item ${value === '' ? 'selected' : ''}`}
                onClick={() => handleSelect('')}
              >
                {emptyOptionLabel}
              </button>
            )}
            {filteredOptions.length === 0 ? (
              <div className="searchable-dropdown-empty">Ничего не найдено</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={`searchable-dropdown-item ${option.value === value ? 'selected' : ''}`}
                  onClick={() => handleSelect(option.value)}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableDropdown;
