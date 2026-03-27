# ════════════════════════════════════════════════════════════════════
#  INTERNATIONALIZATION — Bulgarian messages
# ════════════════════════════════════════════════════════════════════

MESSAGES = {
    "bg": {
        # Farms
        "farm_not_found": "Търговецът не е намерен.",
        "farms_found": "Намерени {count} търговци в радиус от {radius} км.",
        "no_farms_found": "Няма намерени търговци в радиус от {radius} км.",
        "farms_with_products_found": "Намерени {count} търговци с подходящи продукти.",
        "no_farms_with_products": "Няма намерени продукти '{keyword}' в радиус от {radius} км.",
        "farm_created": "Търговецът е създаден успешно.",
        "farm_updated": "Търговецът е актуализиран успешно.",
        
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
    },
    "en": {}
}


def get_message(key: str, lang: str = "bg", **kwargs) -> str:
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