const TableSearch = () => {
  return (
    <div className="w-full md:w-auto flex items-center gap-2 text-xs rounded-full ring-[1.5px] ring-gray-300 dark:ring-gray-700 px-2 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-200">
      <img src="/search.png" alt="" width={14} height={14} />
      <input
        type="text"
        placeholder="Search..."
        className="w-[200px] p-2 bg-transparent outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
      />
    </div>
  );
};

export default TableSearch;
