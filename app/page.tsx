export default function Home() {
  const appId = process.env.NEXT_PUBLIC_GHL_APP_ID || "";
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-2xl p-8 sm:p-12 max-w-xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-center mb-4 text-gray-900 dark:text-white">
          Welcome to Kleegr WhatsApp!
        </h1>
        <p className="text-lg text-gray-700 dark:text-gray-300 mb-6 text-center">
          To install the app, click the below button:
        </p>
        <div className="flex justify-center">
          <a
            href={`https://app.gohighlevel.com/integration/${appId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-6 py-3 text-lg font-medium rounded-full text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 dark:focus:ring-indigo-800 transition-colors"
          >
            Install App
          </a>
        </div>
      </div>
    </div>
  );
}
