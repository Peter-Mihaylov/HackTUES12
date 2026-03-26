# ════════════════════════════════════════════════════════════════════
#  INTERNATIONALIZATION — English & Bulgarian messages
# ════════════════════════════════════════════════════════════════════

MESSAGES = {
    "en": {
        # Farms
        "farm_not_found": "Farm not found.",
        "farms_found": "Found {count} farms within {radius} km.",
        "no_farms_found": "No farms found within {radius} km.",
        "farms_with_products_found": "Found {count} farms with matching products.",
        "no_farms_with_products": "No farms with matching products found within {radius} km for '{keyword}'.",
        "farm_created": "Farm created successfully.",
        "farm_updated": "Farm updated successfully.",
        
        # Listings
        "product_not_found": "Product not found.",
        "product_created": "Product listing created successfully.",
        "product_updated": "Product updated successfully.",
        "product_deleted": "Product {id} deleted.",
        "product_listings": "product listings",
        
        # Search
        "search_required": "Please enter a keyword or select a category to search.",
        "search_in_category": "in category '{category}'",
        "search_for_keyword": "for '{keyword}'",
        
        # Health
        "api_running": "Farm Market API is running",
        "status_healthy": "healthy",
    },
    "bg": {
        # Farms
        "farm_not_found": "Фермата не е намерена.",
        "farms_found": "Намерени {count} ферми в радиус от {radius} км.",
        "no_farms_found": "Няма намерени ферми в радиус от {radius} км.",
        "farms_with_products_found": "Намерени {count} ферми с подходящи продукти.",
        "no_farms_with_products": "Няма намерени продукти '{keyword}' в радиус от {radius} км.",
        "farm_created": "Фермата е създадена успешно.",
        "farm_updated": "Фермата е актуализирана успешно.",
        
        # Listings
        "product_not_found": "Продуктът не е намерен.",
        "product_created": "Продуктът е добавен успешно.",
        "product_updated": "Продуктът е актуализиран успешно.",
        "product_deleted": "Продукт {id} е изтрит.",
        "product_listings": "продуктови предложения",
        
        # Search
        "search_required": "Моля, въведете ключова дума или изберете категория за търсене.",
        "search_in_category": "в категория '{category}'",
        "search_for_keyword": "за '{keyword}'",
        
        # Health
        "api_running": "Farm Market API работи",
        "status_healthy": "здрав",
    }
}


def get_message(key: str, lang: str = "en", **kwargs) -> str:
    """
    Get a message in the specified language.
    
    Args:
        key: Message key
        lang: Language code ('en' or 'bg')
        **kwargs: Placeholders to format the message
    
    Returns:
        Formatted message string
    """
    lang = lang.lower() if lang in MESSAGES else "en"
    message = MESSAGES[lang].get(key, MESSAGES["en"].get(key, key))
    return message.format(**kwargs) if kwargs else message
